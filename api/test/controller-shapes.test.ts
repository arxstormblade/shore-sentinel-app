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
      if (sql.includes('SELECT f.severity, count(*)::int AS count')) return { rows: [{ severity: 'high', count: 2 }, { severity: 'medium', count: 1 }] };
      if (sql.includes('FROM scan_runs r LEFT JOIN targets')) return { rows: [{ id: 'run-1', status: 'completed', subject_name: 'alpha-ws-01' }] };
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) return { rows: [{ id: 'run-1', job_id: params[1], subject_type: params[2], target_id: params[3], one_time_audit_id: params[4], status: 'pending' }] };
      if (sql.includes('INSERT INTO artifacts')) return { rows: [{ id: 'artifact-1', run_id: params[1], artifact_type: params[2], storage_uri: params[3], sha256: params[4], size_bytes: params[6] }] };
      if (sql.includes('SELECT id, target_id, one_time_audit_id FROM scan_runs')) return { rows: [{ id: 'run-1', target_id: 'target-1', one_time_audit_id: null }] };
      if (sql.includes('INSERT INTO findings')) return { rows: [{ id: 'finding-1', scanner_finding_id: params[1], title: params[2], severity: params[4] }] };
      if (sql.includes('INSERT INTO finding_instances')) return { rows: [{ id: 'finding-instance-1' }] };
      if (sql.includes('INSERT INTO one_time_audits')) return { rows: [{ id: 'audit-1', display_name: params[1], status: 'draft' }] };
      if (sql.includes('INSERT INTO targets')) return { rows: [{ id: 'target-1', hostname: params[1], status: 'unknown' }] };
      if (sql.includes('SELECT id FROM environments')) return { rows: [{ id: 'env-1' }] };
      if (sql.includes('SELECT * FROM targets WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: 'target-1', hostname: 'alpha-ws-01', fqdn: 'alpha-ws-01.example.test', owner_team: 'Desktop Engineering', platform: 'windows', connection_mode: 'pull_checkin', monitoring_enabled: true }] };
      if (sql.includes('SELECT id FROM targets WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: 'target-1' }] };
      if (sql.includes('SELECT * FROM artifacts WHERE tenant_id=$1 AND run_id=$2')) return { rows: [{ id: 'artifact-1', artifact_type: ARTIFACT_KIND.scannerRawOutput, storage_uri: 's3://bucket/runs/run-1/file.json', sha256: 'a'.repeat(64), mime_type: 'application/json', size_bytes: 12 }] };
      if (sql.includes('SELECT r.*') && sql.includes('FROM scan_runs r')) return { rows: [{ id: 'run-1', status: 'completed', latest_event_type: 'job.succeeded', latest_progress_percent: 100, artifacts: [{ id: 'artifact-1', artifact_type: ARTIFACT_KIND.scannerRawOutput }] }] };
      if (sql.includes('UPDATE targets SET')) return { rows: [{ id: 'target-1', hostname: params[2] ?? 'alpha-ws-01', fqdn: params[3] ?? 'alpha-ws-01.example.test', owner_team: params[4] ?? 'Desktop Engineering', platform: params[5] ?? 'windows', connection_mode: params[6] ?? 'pull_checkin' }] };
      if (sql.includes('DELETE FROM targets')) return { rows: [] };
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
  const artifacts = {
    createUpload: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/file.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/file.${artifactType}`, upload_url: null }),
    storeWorkerArtifact: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/handoff.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/handoff.${artifactType}` }),
    readArtifact: async () => { throw new Error('not implemented in test'); },
  };
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

test('normalized findings artifact populates dashboard finding tables', async () => {
  const { app, calls } = controller();
  await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.normalizedFindings,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify([
      { id: 'check-high', title: 'High risk issue', severity: 'high', category: 'agent-security', description: 'Evidence summary', remediation: 'Fix it' },
      { id: 'check-moderate', title: 'Moderate issue', severity: 'moderate', category: 'agent-security' },
    ])).toString('base64'),
  });

  assert.equal(calls.some((sql) => sql.includes('INSERT INTO findings')), true);
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO finding_instances')), true);
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM finding_instances')), true);
});

test('dashboard metrics aggregate live findings by severity', async () => {
  const { app } = controller();
  const result = await app.dashboardMetrics();
  assert.deepEqual(result.severityCounts, { critical: 0, high: 2, medium: 1, low: 0, informational: 0 });
  assert.equal(result.totalFindings, 3);
});

test('managed target update endpoint persists editable machine fields', async () => {
  const { app, calls } = controller();
  const result = await app.updateTarget('target-1', {
    hostname: 'alpha-ws-01',
    fqdn: 'alpha-ws-01.example.test',
    owner_team: 'Desktop Engineering',
    platform: 'windows',
    connection_mode: 'pull_checkin',
  });

  assert.equal(result.id, 'target-1');
  assert.equal(result.hostname, 'alpha-ws-01');
  assert.equal(calls.some((sql) => sql.includes('UPDATE targets SET')), true);
});

test('managed target delete endpoint removes dependent scan data before deleting the machine', async () => {
  const { app, calls } = controller();
  const result = await app.deleteTarget('target-1');

  assert.equal(result.deleted, true);
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM scan_jobs')), true);
  assert.equal(calls.some((sql) => sql.includes('DELETE FROM targets')), true);
});

test('managed target scan run endpoint returns the live run history with artifacts', async () => {
  const { app } = controller();
  const result = await app.targetScanRuns('target-1');

  assert.ok(Array.isArray(result.runs));
  assert.equal(result.runs[0].id, 'run-1');
  assert.equal(result.runs[0].artifacts[0].artifact_type, ARTIFACT_KIND.scannerRawOutput);
});
