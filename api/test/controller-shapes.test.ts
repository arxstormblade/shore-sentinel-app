import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ARTIFACT_KIND, QUEUES, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { AppController } from '../src/app.controller.js';

function controller() {
  const calls: string[] = [];
  const queueCalls: { queueName: string; payload: Record<string, unknown> }[] = [];
  const scanRunInserts: unknown[][] = [];
  const rows: Record<string, unknown>[] = [];
  const db = {
    isReady: () => true,
    tenantId: async () => 'tenant-1',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) {
        scanRunInserts.push(params);
        return { rows: [{ id: 'run-1', job_id: params[1], subject_type: params[2], target_id: params[3], one_time_audit_id: params[4], status: 'pending', runtime_context: params[5] }] };
      }
      if (sql.includes('INSERT INTO artifacts')) return { rows: [{ id: 'artifact-1', run_id: params[1], artifact_type: params[2], storage_uri: params[3], sha256: params[4], size_bytes: params[6] }] };
      if (sql.includes('INSERT INTO credentials')) return { rows: [{ id: 'credential-1' }] };
      if (sql.includes('INSERT INTO targets')) return { rows: [{ id: 'target-1', hostname: params[1], status: 'unknown', ssh_auth_method: params[8], ssh_port: params[9], ssh_username: params[10], ssh_credential_id: params[11] }] };
      if (sql.includes('SELECT u.id, u.email, u.display_name, u.disabled_at')) return { rows: [{ id: 'user-1', email: 'admin@shore360.local', display_name: 'Initial Admin', disabled_at: null, roles: ['admin'] }] };
      if (sql.includes('FROM artifacts') && sql.includes('tenant_id') && sql.includes('run_id')) return { rows: [{ id: 'artifact-pdf-1', artifact_type: 'pdf', storage_uri: 's3://shore-sentinel-artifacts/runs/run-1/report.pdf', mime_type: 'text/html', size_bytes: 25, parse_status: 'uploaded', download_path: '/artifacts/artifact-pdf-1/download' }] };
      if (sql.includes('FROM scan_runs sr') && sql.includes('sr.id = $2')) return { rows: [{ id: 'run-1', title: 'Managed host', source: 'Managed machine', env: 'Production', status: 'completed', severity: 'high', findings: [] }] };
      if (sql.includes('SELECT id, artifact_type, storage_uri, mime_type, size_bytes FROM artifacts')) return { rows: [{ id: params[1], artifact_type: 'pdf', storage_uri: 's3://shore-sentinel-artifacts/runs/run-1/report.pdf', mime_type: 'application/pdf', size_bytes: 25 }] };
      if (sql.includes('SELECT id, status, title FROM remediation_items')) return { rows: [{ id: params[1], status: 'open', title: 'Apply security update' }] };
      if (sql.includes('UPDATE remediation_items SET status=')) return { rows: [{ id: params[2], status: params[0], title: 'Apply security update' }] };
      if (sql.includes('u.deleted_at')) throw new Error('users query must not reference deleted_at; schema uses disabled_at');
      if (sql.includes('SELECT id FROM environments')) return { rows: [{ id: 'env-1' }] };
      rows.push({ sql, params });
      return { rows: [] };
    },
  };

  const authCalls: { method: string; args: unknown[] }[] = [];
  const auth = {
    register: async (...args: unknown[]) => {
      authCalls.push({ method: 'register', args });
      return { token: 'token-1', user: { id: 'user-1', email: args[1], display_name: args[0] } };
    },
    login: async (...args: unknown[]) => {
      authCalls.push({ method: 'login', args });
      return { token: 'token-2', user: { id: 'user-2', email: args[0], display_name: 'Operator' } };
    },
    me: async (token?: string) => {
      if (token === 'admin-token') return { id: 'admin-1', email: 'admin@example.test', display_name: 'Admin', roles: ['admin'] };
      if (token === 'operator-token') return { id: 'operator-1', email: 'operator@example.test', display_name: 'Operator', roles: ['operator'] };
      if (token === 'analyst-token') return { id: 'analyst-1', email: 'analyst@example.test', display_name: 'Analyst', roles: ['analyst'] };
      if (token === 'viewer-token') return { id: 'viewer-1', email: 'viewer@example.test', display_name: 'Viewer', roles: ['viewer'] };
      throw new Error('not authenticated');
    },
  };

  const queue = {
    health: async () => ({ configured: false }),
    enqueue: async (queueName: string, payload: Record<string, unknown>) => {
      queueCalls.push({ queueName, payload });
      return { queued: true, queue: queueName === 'scan_jobs' ? QUEUES.scanJobs : QUEUES.artifactProcessing, payload };
    },
  };

  const artifacts = {
    createUpload: async (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/file.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/file.${artifactType}`, upload_url: null }),
    download: async () => ({ Body: Readable.from([Buffer.from('%PDF-1.4 test')]), ContentType: 'application/pdf', ContentLength: 13 }),
  };
  const updateCalls: string[] = [];
  const updates = {
    run: async (mode: 'status' | 'check' | 'apply') => {
      updateCalls.push(mode);
      return { enabled: mode !== 'status', mode, ok: true, stdout: `${mode} complete`, stderr: '', exitCode: 0, script: '/app/scripts/shore-sentinel-update.sh' };
    },
  };
  return { app: new AppController(db as never, auth as never, queue as never, artifacts as never, updates as never), calls, queueCalls, scanRunInserts, authCalls, updateCalls };
}


test('managed target scan-job endpoint enqueues worker-compatible payload', async () => {
  const { app, queueCalls } = controller();
  const result = await app.runTarget('target-1', { priority: 80 }, { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never);
  assert.equal(result.job.subject_type, 'managed_target');
  assert.equal(result.job.target_id, 'target-1');
  assert.equal(result.job.one_time_audit_id, null);
  assert.equal(queueCalls[0].queueName, 'scan_jobs');
  assert.equal(queueCalls[0].payload.runId, 'run-1');
  assert.equal(queueCalls[0].payload.run_id, 'run-1');
  assert.equal(queueCalls[0].payload.jobId, 'job-1');
  assert.equal((queueCalls[0].payload.scannerOutput as Record<string, unknown>).contractVersion, scannerBundleContractVersion());
});

test('managed target scan stores an allowlisted directory scope only', async () => {
  const { app, scanRunInserts } = controller();
  const result = await app.runTarget('target-1', {
    scan_target: '/srv/app',
    runtime_context: { credential: 'do-not-store', raw_output: 'do-not-store' },
  }, { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never);
  assert.deepEqual(scanRunInserts[0][5], { scan_target: '/srv/app' });
  assert.equal(result.run.scan_target, '/srv/app');
  assert.equal('runtime_context' in result.run, false);
});

test('artifact upload init response exposes object key, storage uri, and upload url field', async () => {
  const { app } = controller();
  const result = await app.uploadInit({ run_id: 'run-1', artifact_type: 'json' });
  assert.equal(result.object_key, 'runs/run-1/file.json');
  assert.equal(result.storage_uri, 's3://bucket/runs/run-1/file.json');
  assert.equal(result.upload_url, null);
});

test('login endpoint supports remember me and caps the session cookie at 30 days', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const result = await app.login(
    { email: 'operator@example.test', password: 'ChangeMe123!', remember_me: '1' },
    { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never,
  );
  assert.equal(authCalls[0].method, 'login');
  assert.deepEqual(authCalls[0].args, ['operator@example.test', 'ChangeMe123!', true]);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-2');
  assert.equal(cookies[0].options.maxAge, 60 * 60 * 24 * 30 * 1000);
  assert.equal(result.user.email, 'operator@example.test');
});

test('register endpoint creates local account through AuthService and sets session cookie when explicitly enabled', async () => {
  const { app, authCalls } = controller();
  const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const previous = process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION;
  process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION = 'true';
  const result = await app.register({ name: 'Local Operator', email: 'operator@example.test', password: 'ChangeMe123!' }, { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as never);
  if (previous === undefined) delete process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION;
  else process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION = previous;
  assert.equal(authCalls[0].method, 'register');
  assert.deepEqual(authCalls[0].args, ['Local Operator', 'operator@example.test', 'ChangeMe123!', false]);
  assert.equal(cookies[0].name, 'shore_session');
  assert.equal(cookies[0].value, 'token-1');
  assert.equal(cookies[0].options.maxAge, undefined);
  assert.equal(result.user.email, 'operator@example.test');
});

test('public registration is disabled unless explicitly enabled', async () => {
  const { app } = controller();
  const previous = process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION;
  delete process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION;
  await assert.rejects(
    () => app.register({ name: 'Local Operator', email: 'operator@example.test', password: 'ChangeMe123!' }, { cookie: () => undefined } as never),
    /Public registration is disabled/,
  );
  if (previous !== undefined) process.env.SHORE_SENTINEL_ALLOW_PUBLIC_REGISTRATION = previous;
});

test('users endpoint lists accounts with disabled_at from the current schema', async () => {
  const { app } = controller();
  const result = await app.listUsers({ cookies: { shore_session: 'admin-token' }, header: () => undefined } as never);
  assert.equal(result.length, 1);
  assert.equal(result[0].email, 'admin@shore360.local');
  assert.equal(result[0].disabled_at, null);
  assert.deepEqual(result[0].roles, ['admin']);
});

test('inventory, reports, historical audits, and remediation list endpoints are backed by database reads', async () => {
  const { app, calls } = controller();
  await app.listTargets();
  await app.listReports();
  await app.listAudits();
  await app.listRemediation();
  assert.ok(calls.some((sql) => sql.includes('FROM targets t')));
  assert.ok(calls.some((sql) => sql.includes('FROM scan_runs sr')));
  assert.ok(calls.some((sql) => sql.includes('FROM one_time_audits')));
  assert.ok(calls.some((sql) => sql.includes('FROM remediation_items ri')));
});

test('report detail includes downloadable scanner artifacts', async () => {
  const { app } = controller();
  const result = await app.getReport('run-1');
  assert.equal(result.id, 'run-1');
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].artifact_type, 'pdf');
  assert.equal(result.artifacts[0].download_path, '/artifacts/artifact-pdf-1/download');
  assert.equal('storage_uri' in result.artifacts[0], false);
  assert.equal('mime_type' in result.artifacts[0], false);
});

test('scan-run artifact endpoint returns only public artifact DTO fields', async () => {
  const { app } = controller();
  const result = await app.runArtifacts('run-1');
  assert.equal(result.artifacts.length, 1);
  assert.deepEqual(Object.keys(result.artifacts[0]).sort(), ['artifact_type', 'content_type', 'created_at', 'download_path', 'id', 'parse_status', 'size_bytes']);
  assert.equal('storage_uri' in result.artifacts[0], false);
});

test('artifact download streams persisted object with content headers', async () => {
  const { app } = controller();
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    on: () => res,
    once: () => res,
    emit: () => true,
    write: () => true,
    end: () => true,
  };
  await app.downloadArtifact('artifact-pdf-1', res as never);
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Content-Disposition'], /^attachment;/);
  assert.match(headers['Content-Disposition'], /shore-sentinel-pdf\.pdf/);
});

test('delete user detaches audit-log actor references before removing the account', async () => {
  const { app, calls } = controller();
  const result = await app.deleteUser('user-with-audit-log', { cookies: { shore_session: 'admin-token' }, header: () => undefined } as never);
  assert.deepEqual(result, { ok: true });
  const detachIndex = calls.findIndex((sql) => sql.includes('UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = $1'));
  const roleDeleteIndex = calls.findIndex((sql) => sql.includes('DELETE FROM user_roles WHERE user_id = $1'));
  const userDeleteIndex = calls.findIndex((sql) => sql.includes('DELETE FROM users WHERE id = $1'));
  assert.notEqual(detachIndex, -1);
  assert.notEqual(roleDeleteIndex, -1);
  assert.notEqual(userDeleteIndex, -1);
  assert.ok(detachIndex < roleDeleteIndex);
  assert.ok(roleDeleteIndex < userDeleteIndex);
});

test('admin-only update endpoints expose status, check, and apply modes', async () => {
  const { app, updateCalls } = controller();
  const req = { cookies: { shore_session: 'admin-token' }, header: () => undefined } as never;
  const status = await app.updateStatus(req);
  const check = await app.checkUpdate(req);
  const apply = await app.applyUpdate(req);
  assert.equal(status.mode, 'status');
  assert.equal(check.mode, 'check');
  assert.equal(apply.mode, 'apply');
  assert.deepEqual(updateCalls, ['status', 'check', 'apply']);
});

test('update endpoints reject non-admin operators', async () => {
  const { app } = controller();
  const req = { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never;
  await assert.rejects(() => app.updateStatus(req), /Admin role required/);
});

test('create target stores SSH credentials as sealed metadata references', async () => {
  const { app, calls } = controller();
  const result = await app.createTarget({
    hostname: 'alpha-ws-01',
    platform: 'linux',
    connection_mode: 'ssh_push',
    ssh_auth_method: 'password',
    ssh_username: 'scanner',
    ssh_port: '2222',
    ssh_password: 'temporary-test-password',
  }, { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never);
  assert.equal(result.ssh_auth_method, 'password');
  assert.equal(result.ssh_port, 2222);
  assert.equal(result.ssh_username, 'scanner');
  assert.equal(result.ssh_credential_id, 'credential-1');
  assert.ok(calls.some((sql) => sql.includes('INSERT INTO credentials')));
});

test('remediation status mutation persists every canonical schema status', async () => {
  const { app } = controller();
  for (const status of ['open', 'accepted', 'ignored', 'resolved']) {
    const result = await app.updateRemediationStatus('remediation-1', { status }, { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never);
    assert.equal(result.status, status);
  }
});

test('remediation status mutation rejects non-schema business labels', async () => {
  const { app } = controller();
  for (const status of ['needs_review', 'in_progress', 'fixed', 'accepted_risk']) {
    await assert.rejects(() => app.updateRemediationStatus('remediation-1', { status }, { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never), /invalid status/);
  }
});

test('API mutations enforce role matrix permissions before changing users, targets, or remediation', async () => {
  const { app } = controller();
  const admin = { cookies: { shore_session: 'admin-token' }, header: () => undefined } as never;
  const operator = { cookies: { shore_session: 'operator-token' }, header: () => undefined } as never;
  const analyst = { cookies: { shore_session: 'analyst-token' }, header: () => undefined } as never;
  const viewer = { cookies: { shore_session: 'viewer-token' }, header: () => undefined } as never;

  await assert.rejects(() => app.listUsers(viewer), /Admin role required/);
  await assert.rejects(() => app.createTarget({ hostname: 'viewer-host', connection_mode: 'pull_checkin' }, viewer), /Insufficient permissions/);
  await assert.rejects(() => app.updateTarget('target-1', { hostname: 'viewer-host' }, viewer), /Insufficient permissions/);
  await assert.rejects(() => app.deleteTarget('target-1', operator), /Admin role required/);
  await assert.rejects(() => app.runTarget('target-1', {}, viewer), /Insufficient permissions/);
  await assert.rejects(() => app.updateRemediationStatus('remediation-1', { status: 'resolved' }, viewer), /Insufficient permissions/);
  await assert.doesNotReject(() => app.runTarget('target-1', {}, analyst));
  await assert.doesNotReject(() => app.updateRemediationStatus('remediation-1', { status: 'resolved' }, operator));
  await assert.doesNotReject(() => app.listUsers(admin));
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
