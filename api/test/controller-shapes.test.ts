import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND, QUEUES, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { AppController } from '../src/app.controller.js';

function controller() {
  const calls: string[] = [];
  const queueCalls: { queueName: string; payload: Record<string, unknown> }[] = [];
  const rows: Record<string, unknown>[] = [];
  const db = {
    isReady: () => true,
    tenantId: async () => 'tenant-1',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) return { rows: [{ id: 'run-1', job_id: params[1], subject_type: params[2], target_id: params[3], one_time_audit_id: params[4], status: 'pending' }] };
      if (sql.includes('INSERT INTO artifacts')) return { rows: [{ id: 'artifact-1', run_id: params[1], artifact_type: params[2], storage_uri: params[3], sha256: params[4], size_bytes: params[6] }] };
      if (sql.includes('INSERT INTO one_time_audits')) return { rows: [{ id: 'audit-1', display_name: params[1], status: 'draft' }] };
      if (sql.includes('INSERT INTO targets')) return { rows: [{ id: 'target-1', hostname: params[1], status: 'unknown' }] };
      if (sql.includes('SELECT id FROM environments')) return { rows: [{ id: 'env-1' }] };
      rows.push({ sql, params }); return { rows: [] };
    }
  };
  const authCalls: { method: string; args: unknown[] }[] = [];
  const auth = {
    register: async (...args: unknown[]) => { authCalls.push({ method: 'register', args }); return { token: 'token-1', user: { id: 'user-1', email: args[1], display_name: args[0] } }; },
    login: async (...args: unknown[]) => { authCalls.push({ method: 'login', args }); return { token: 'token-1', user: { id: 'user-1', email: args[0], display_name: 'Local Operator' } }; },
  };
  const queue = {
    health: async () => ({ configured: false }),
    enqueue: async (queueName: string, payload: Record<string, unknown>) => {
      queueCalls.push({ queueName, payload });
      return { queued: true, queue: queueName === 'scan_jobs' ? QUEUES.scanJobs : QUEUES.artifactProcessing, payload };
    }
  };
  const artifacts = { createUpload: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/file.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/file.${artifactType}`, upload_url: null }) };
  return { app: new AppController(db as never, auth as never, queue as never, artifacts as never), calls, queueCalls, authCalls };
}

test('one-time audit run endpoint returns job, run, and BullMQ queue envelope', async () => {
  const { app } = controller();
  const result = await app.runAudit('audit-1', { scanner_bundle_version: 'scanner-v1' });
  assert.equal(result.job.subject_type, 'one_time_audit');
  assert.equal(result.job.one_time_audit_id, 'audit-1');
  assert.equal(result.run.status, 'pending');
  assert.equal(result.queue.queued, true);
  assert.equal(result.queue.queue, QUEUES.scanJobs);
});

test('managed target scan-job endpoint enqueues worker-compatible payload', async () => {
  const { app, queueCalls } = controller();
  const result = await app.runTarget('target-1', { priority: 80 });
  assert.equal(result.job.subject_type, 'managed_target');
  assert.equal(result.job.target_id, 'target-1');
  assert.equal(result.job.one_time_audit_id, null);
  assert.equal(queueCalls[0].queueName, 'scan_jobs');
  assert.equal(queueCalls[0].payload.runId, 'run-1');
  assert.equal(queueCalls[0].payload.run_id, 'run-1');
  assert.equal(queueCalls[0].payload.jobId, 'job-1');
  assert.equal((queueCalls[0].payload.scannerOutput as Record<string, unknown>).contractVersion, scannerBundleContractVersion());
});

test('artifact upload init response exposes object key, storage uri, and upload url field', async () => {
  const { app } = controller();
  const result = await app.uploadInit({ run_id: 'run-1', artifact_type: 'json' });
  assert.equal(result.object_key, 'runs/run-1/file.json');
  assert.equal(result.storage_uri, 's3://bucket/runs/run-1/file.json');
  assert.equal(result.upload_url, null);
});

test('register endpoint creates local account through AuthService and sets session cookie', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const result = await app.register(
    { name: 'Local Operator', email: 'operator@example.test', password: 'ChangeMe123!' },
    { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never,
  );
  assert.equal(authCalls[0].method, 'register');
  assert.deepEqual(authCalls[0].args, ['Local Operator', 'operator@example.test', 'ChangeMe123!']);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-1');
  assert.equal(result.user.email, 'operator@example.test');
});

test('login endpoint honors remember-me with a 30 day session cookie', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const result = await app.login(
    { email: 'operator@example.test', password: 'ChangeMe123!', rememberMe: true },
    { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never,
  );

  assert.equal(authCalls[0].method, 'login');
  assert.deepEqual(authCalls[0].args, ['operator@example.test', 'ChangeMe123!', true]);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-1');
  assert.equal(cookies[0].options.maxAge, 1000 * 60 * 60 * 24 * 30);
  assert.equal(result.user.email, 'operator@example.test');
});

test('worker artifact handoff accepts canonical shared artifact kinds', async () => {
  const { app, queueCalls } = controller();
  const result = await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.scannerRawOutput,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify({ ok: true })).toString('base64'),
  });
  assert.equal(result.artifact_type, ARTIFACT_KIND.scannerRawOutput);
  assert.equal(queueCalls[0].queueName, 'artifact_processing');
  assert.equal(queueCalls[0].payload.artifactType, ARTIFACT_KIND.scannerRawOutput);
});
