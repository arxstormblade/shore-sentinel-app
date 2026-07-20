import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { ARTIFACT_KIND, QUEUES, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { AppController } from '../src/app.controller.js';

const TEST_WORKER_TOKEN = 'worker-controller-shape-token';
const TEST_WORKER_CAPABILITY_SECRET = 'worker-controller-capability-secret-at-least-32-bytes';
process.env.INTERNAL_WORKER_TOKEN = TEST_WORKER_TOKEN;
process.env.SHORE_SENTINEL_SECRET_KEY = TEST_WORKER_CAPABILITY_SECRET;
const workerCapability = (runId = 'run-1', grantId = 'grant-1') => createHmac('sha256', TEST_WORKER_CAPABILITY_SECRET).update(`${runId}:${grantId}`).digest('base64url');
const workerRequest = (capability = workerCapability()) => ({
  header: (name: string) => {
    if (name.toLowerCase() === 'authorization') return `Bearer ${TEST_WORKER_TOKEN}`;
    if (name.toLowerCase() === 'x-worker-capability') return capability;
    return undefined;
  },
}) as never;

const operatorRequest = { principal: { userId: 'operator-1', tenantId: 'tenant-1', roles: ['operator'] }, header: () => undefined } as never;
const adminRequest = { principal: { userId: 'admin-1', tenantId: 'tenant-1', roles: ['admin'] }, header: () => undefined } as never;
const analystRequest = { principal: { userId: 'analyst-1', tenantId: 'tenant-1', roles: ['analyst'] }, header: () => undefined } as never;
const viewerRequest = { principal: { userId: 'viewer-1', tenantId: 'tenant-1', roles: ['viewer'] }, header: () => undefined } as never;

function controller(options: { inactiveArtifact?: boolean; inactiveAfterStore?: boolean; rejectWorkerEvent?: boolean; lifecycleAttemptState?: boolean; artifactDeleteFails?: boolean } = {}) {
  const calls: string[] = [];
  const queryCalls: { sql: string; params: unknown[] }[] = [];
  const queueCalls: { queueName: string; payload: Record<string, unknown> }[] = [];
  const operationOrder: string[] = [];
  const scanRunInserts: unknown[][] = [];
  const rows: Record<string, unknown>[] = [];
  let activeWorkerAttempt = 1;
  const db = {
    isReady: () => true,
    tenantId: async () => 'tenant-1',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      queryCalls.push({ sql, params });
      if (sql.includes('artifact_cleanup_work')) operationOrder.push('cleanup-persisted');
      if (sql.includes('INSERT INTO credentials') && sql.includes('INSERT INTO ssh_host_key_pins')) return { rows: [{ id: 'target-1', hostname: params[5], status: 'unknown', ssh_auth_method: params[12], ssh_port: params[13], ssh_username: params[14], ssh_credential_id: 'credential-1' }] };
      if (sql.includes('ssh_host_key_pins')) return { rows: [{ hostname: '10.20.30.40', ssh_port: 22, ssh_credential_id: 'credential-1', credential_disabled_at: null, algorithm: 'ssh-ed25519', fingerprint: 'SHA256:valid-pinned-host-key', revoked_at: null, cidr: '10.20.0.0/16', policy_port: 22, policy_enabled: true, root_path: '/srv/shore-sentinel', root_enabled: true }] };
      if (sql.includes('WITH authorized AS') && sql.includes('persisted_event AS')) {
        if (options.rejectWorkerEvent) return { rows: [] };
        if (options.lifecycleAttemptState && params[4] === 'job.retry_scheduled') activeWorkerAttempt = Number(params[3]) + 1;
        return { rows: [{ run_id: params[1] }] };
      }
      if (sql.trimStart().startsWith('INSERT INTO worker_execution_grants')) return { rows: [{ id: 'grant-1' }] };
      if (sql.includes('INSERT INTO scan_dispatch_outbox')) {
        scanRunInserts.push(params);
        return { rows: [{
          job: { id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' },
          run: { id: 'run-1', job_id: 'job-1', subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'pending', runtime_context: params[7] },
          dispatch_id: 'outbox-1',
        }] };
      }
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: params[0], subject_type: params[1], target_id: params[2], one_time_audit_id: params[3], status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) {
        scanRunInserts.push(params);
        return { rows: [{ id: 'run-1', job_id: params[1], subject_type: params[2], target_id: params[3], one_time_audit_id: params[4], status: 'pending', runtime_context: params[5] }] };
      }
      if (sql.includes('SELECT g.id AS grant_id') && sql.includes('worker_execution_grants')) {
        if (options.lifecycleAttemptState && Number(params[1]) !== activeWorkerAttempt) return { rows: [] };
        return { rows: [{ grant_id: options.lifecycleAttemptState ? `grant-${params[1]}` : 'grant-1', tenant_id: 'tenant-1' }] };
      }
      if (sql.includes('finalized_artifact')) return { rows: options.inactiveAfterStore ? [] : [{ id: params[2], run_id: params[1], artifact_type: ARTIFACT_KIND.scannerRawOutput, storage_uri: params[3], parse_status: 'uploaded' }] };
      if (sql.includes('final_state AS')) return { rows: [{ status: 'cancelled', storage_uri: null }] };
      if (sql.includes('INSERT INTO artifacts')) return { rows: options.inactiveArtifact ? [] : [{ id: 'artifact-1', run_id: params[1], artifact_type: params[2], storage_uri: params[3], sha256: params[4], size_bytes: params[6] }] };
      if (sql.includes('INSERT INTO credentials')) return { rows: [{ id: 'credential-1' }] };
      if (sql.includes('INSERT INTO targets')) return { rows: [{ id: 'target-1', hostname: params[1], status: 'unknown', ssh_auth_method: params[8], ssh_port: params[9], ssh_username: params[10], ssh_credential_id: params[11] }] };
      if (sql.startsWith('SELECT id FROM users WHERE tenant_id=$1 AND id=$2')) return { rows: [{ id: params[1] }] };
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
    deliverScanDispatch: async () => {
      const payload = { id: 'job-1', jobId: 'job-1', runId: 'run-1', run_id: 'run-1', subjectType: 'managed_target', subject_type: 'managed_target', targetId: 'target-1', target_id: 'target-1', oneTimeAuditId: null, one_time_audit_id: null };
      queueCalls.push({ queueName: 'scan_jobs', payload });
      operationOrder.push('queue:scan_jobs');
      return { queued: true, published: true, queue: QUEUES.scanJobs, jobId: 'outbox-1' };
    },
    enqueue: async (queueName: string, payload: Record<string, unknown>) => {
      queueCalls.push({ queueName, payload });
      operationOrder.push(`queue:${queueName}`);
      return { queued: true, queue: queueName === 'scan_jobs' ? QUEUES.scanJobs : QUEUES.artifactProcessing, payload };
    },
  };

  const artifactStores: { storageUri: string; body: Buffer; contentType?: string }[] = [];
  const artifactDeletes: string[] = [];
  const cleanupCalls: { tenantId: string; runId?: string }[] = [];
  const artifacts = {
    prepare: (runId: string, artifactType: string) => ({ object_key: `runs/${runId}/stored.${artifactType}`, storage_uri: `s3://bucket/runs/${runId}/stored.${artifactType}` }),
    store: async (storageUri: string, body: Buffer, contentType?: string) => {
      artifactStores.push({ storageUri, body, contentType });
    },
    delete: async (storageUri: string) => {
      artifactDeletes.push(storageUri);
      if (options.artifactDeleteFails) throw new Error('MinIO delete unavailable');
    },
    reconcileCleanup: async (tenantId: string, runId?: string) => {
      cleanupCalls.push({ tenantId, runId });
      return { attempted: 0, completed: 0, failed: 0 };
    },
    download: async () => ({ Body: Readable.from([Buffer.from('%PDF-1.4 test')]), ContentType: 'application/pdf', ContentLength: 13 }),
  };
  const updateCalls: string[] = [];
  const updates = {
    run: async (mode: 'status' | 'check' | 'apply') => {
      updateCalls.push(mode);
      return { enabled: mode !== 'status', mode, ok: true, stdout: `${mode} complete`, stderr: '', exitCode: 0, script: '/app/scripts/shore-sentinel-update.sh' };
    },
  };
  return { app: new AppController(db as never, auth as never, queue as never, artifacts as never, updates as never), calls, queryCalls, queueCalls, operationOrder, scanRunInserts, artifactStores, artifactDeletes, cleanupCalls, authCalls, updateCalls };
}


test('managed target scan-job endpoint enqueues worker-compatible payload', async () => {
  const { app, queueCalls } = controller();
  const result = await app.runTarget('target-1', { priority: 80 }, operatorRequest);
  assert.equal(result.job.subject_type, 'managed_target');
  assert.equal(result.job.target_id, 'target-1');
  assert.equal(result.job.one_time_audit_id, null);
  assert.equal(queueCalls[0].queueName, 'scan_jobs');
  assert.equal(queueCalls[0].payload.runId, 'run-1');
  assert.equal(queueCalls[0].payload.run_id, 'run-1');
  assert.equal(queueCalls[0].payload.jobId, 'job-1');
  assert.deepEqual(Object.keys(queueCalls[0].payload).sort(), ['id', 'jobId', 'oneTimeAuditId', 'one_time_audit_id', 'runId', 'run_id', 'subjectType', 'subject_type', 'targetId', 'target_id']);
  assert.equal('scannerOutput' in queueCalls[0].payload, false);
});

test('managed SSH scan queues opaque identifiers only and creates a short-lived execution grant', async () => {
  const { app, calls, queueCalls } = controller();
  await app.runTarget('target-1', { scan_target: '/srv/shore-sentinel' }, operatorRequest);
  assert.ok(calls.some((sql) => sql.includes('INSERT INTO worker_execution_grants')));
  assert.deepEqual(Object.keys(queueCalls[0].payload).sort(), ['id', 'jobId', 'oneTimeAuditId', 'one_time_audit_id', 'runId', 'run_id', 'subjectType', 'subject_type', 'targetId', 'target_id']);
  assert.equal('scanTarget' in queueCalls[0].payload, false);
  assert.equal('scannerOutput' in queueCalls[0].payload, false);
});

test('managed target scan stores an allowlisted directory scope only', async () => {
  const { app, scanRunInserts } = controller();
  const result = await app.runTarget('target-1', {
    scan_target: '/srv/app',
    runtime_context: { credential: 'do-not-store', raw_output: 'do-not-store' },
  }, operatorRequest);
  assert.deepEqual(scanRunInserts[0][7], { scan_target: '/srv/app' });
  assert.equal(result.run.scan_target, '/srv/app');
  assert.equal('runtime_context' in result.run, false);
});

test('cancellation is tenant-scoped, terminal, and auditable', async () => {
  const { app, calls } = controller();
  const result = await app.cancelRun('run-1', { reason: 'operator request' }, operatorRequest);
  assert.deepEqual(result, { id: 'run-1', status: 'cancelled' });
  assert.ok(calls.some((sql) => sql.includes("SET status='cancelled'")));
  assert.ok(calls.some((sql) => sql.includes('scan.cancelled')));
});

test('late worker progress cannot revive a cancelled run', async () => {
  const { app, calls } = controller();
  await app.workerEvent('run-1', { type: 'job.running', attempt: 1 }, workerRequest());
  const transition = calls.find((sql) => sql.includes('WITH authorized AS'));
  assert.ok(transition);
  assert.match(transition, /sr\.cancellation_requested_at IS NULL/);
  assert.match(transition, /\$5 IN \('job\.running'[\s\S]*sr\.status IN \('leased','running'\)/);
});

test('late worker success cannot revive a cancelled run', async () => {
  const { app, calls } = controller();
  await app.workerEvent('run-1', { type: 'job.succeeded', attempt: 1 }, workerRequest());
  const transition = calls.find((sql) => sql.includes('WITH authorized AS'));
  assert.ok(transition);
  assert.match(transition, /sr\.cancellation_requested_at IS NULL/);
  assert.match(transition, /\$5 IN \('job\.succeeded'[\s\S]*sr\.status IN \('leased','running'\)/);
});

test('worker event rejects when its atomic capability-guarded transition writes zero rows', async () => {
  const { app } = controller({ rejectWorkerEvent: true });
  await assert.rejects(
    () => app.workerEvent('run-1', { type: 'job.succeeded', attempt: 1 }, workerRequest()),
    /Worker event unavailable/,
  );
});

test('pre-claim retry atomically revokes the consumed attempt, creates the next attempt, and rejects a late terminal event', async () => {
  const { app, calls } = controller({ lifecycleAttemptState: true });
  // Attempt 1 has consumed its SSH grant, but its job.claimed event never persisted.
  await app.workerEvent('run-1', { type: 'job.retry_scheduled', attempt: 1 }, workerRequest(workerCapability('run-1', 'grant-1')));
  const retryTransition = calls.find((sql) => sql.includes('next_attempt AS'));
  assert.ok(retryTransition);
  assert.match(retryTransition, /\$5='job\.retry_scheduled' AND sr\.status IN \('pending','leased','running'\)/);
  assert.match(retryTransition, /UPDATE scan_runs[\s\S]*SET status=\$6/);
  assert.match(retryTransition, /UPDATE scan_jobs[\s\S]*SET status=\$7/);
  assert.match(retryTransition, /\$4 <= sj\.retry_max_attempts/);
  assert.match(retryTransition, /sj\.retry_count=\$4-1 AND \$4 < sj\.retry_max_attempts/);
  assert.match(retryTransition, /g\.consumed_at IS NOT NULL[\s\S]*g\.revoked_at IS NULL[\s\S]*sr\.cancellation_requested_at IS NULL/);
  assert.match(retryTransition, /\$5='job\.retry_scheduled' AND sr\.status IN \('pending','leased','running'\)/);
  assert.match(retryTransition, /INSERT INTO job_events[\s\S]*FROM transitioned_run tr JOIN transitioned_job tj/);
  assert.match(retryTransition, /retry_count=CASE WHEN \$5='job\.retry_scheduled' THEN sj\.retry_count\+1/);
  assert.match(retryTransition, /INSERT INTO worker_execution_grants[\s\S]*\$4\+1/);
  await assert.rejects(
    () => app.workerEvent('run-1', { type: 'job.succeeded', attempt: 1 }, workerRequest(workerCapability('run-1', 'grant-1'))),
    /Worker capability unavailable/,
  );
});

test('legacy client-controlled artifact presign and completion entry points are decommissioned', () => {
  const { app } = controller();
  assert.equal('uploadInit' in app, false);
  assert.equal('uploadComplete' in app, false);
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
  const result = await app.listUsers(adminRequest);
  assert.equal(result.length, 1);
  assert.equal(result[0].email, 'admin@shore360.local');
  assert.equal(result[0].disabled_at, null);
  assert.deepEqual(result[0].roles, ['admin']);
});

test('inventory, reports, historical audits, and remediation list endpoints are backed by database reads', async () => {
  const { app, calls } = controller();
  await app.listTargets(operatorRequest);
  await app.listReports(operatorRequest);
  await app.listAudits(operatorRequest);
  await app.listRemediation(operatorRequest);
  assert.ok(calls.some((sql) => sql.includes('FROM targets t')));
  assert.ok(calls.some((sql) => sql.includes('FROM scan_runs sr')));
  assert.ok(calls.some((sql) => sql.includes('FROM one_time_audits')));
  assert.ok(calls.some((sql) => sql.includes('FROM remediation_items ri')));
});

test('report detail includes downloadable scanner artifacts', async () => {
  const { app } = controller();
  const result = await app.getReport('run-1', operatorRequest);
  assert.equal(result.id, 'run-1');
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].artifact_type, 'pdf');
  assert.equal(result.artifacts[0].download_path, '/artifacts/artifact-pdf-1/download');
  assert.equal('storage_uri' in result.artifacts[0], false);
  assert.equal('mime_type' in result.artifacts[0], false);
});

test('scan-run artifact endpoint returns only public artifact DTO fields', async () => {
  const { app } = controller();
  const result = await app.runArtifacts('run-1', operatorRequest);
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
  await app.downloadArtifact('artifact-pdf-1', operatorRequest, res as never);
  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.match(headers['Content-Disposition'], /^attachment;/);
  assert.match(headers['Content-Disposition'], /shore-sentinel-pdf\.pdf/);
});

test('delete user detaches audit-log actor references before removing the account', async () => {
  const { app, calls } = controller();
  const result = await app.deleteUser('user-with-audit-log', adminRequest);
  assert.deepEqual(result, { ok: true });
  const detachIndex = calls.findIndex((sql) => sql.includes('UPDATE audit_log SET actor_user_id = NULL WHERE tenant_id=$1 AND actor_user_id = $2'));
  const roleDeleteIndex = calls.findIndex((sql) => sql.includes('DELETE FROM user_roles WHERE user_id = $1 AND EXISTS (SELECT 1 FROM users WHERE tenant_id=$2 AND id=$1)'));
  const userDeleteIndex = calls.findIndex((sql) => sql.includes('DELETE FROM users WHERE tenant_id=$1 AND id=$2'));
  assert.notEqual(detachIndex, -1);
  assert.notEqual(roleDeleteIndex, -1);
  assert.notEqual(userDeleteIndex, -1);
  assert.ok(detachIndex < roleDeleteIndex);
  assert.ok(roleDeleteIndex < userDeleteIndex);
});

test('admin-only update endpoints expose status, check, and apply modes', async () => {
  const { app, updateCalls } = controller();
  const req = adminRequest;
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
  const req = operatorRequest;
  await assert.rejects(() => app.updateStatus(req), /Admin role required/);
});

test('create target stores SSH credentials as sealed metadata references', async () => {
  const { app, calls, queryCalls } = controller();
  const previous = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.SHORE_SENTINEL_SECRET_KEY = 'test-only-secret-key-with-at-least-32-bytes';
  const result = await app.createTarget({
    hostname: 'alpha-ws-01',
    platform: 'linux',
    connection_mode: 'ssh_push',
    ssh_auth_method: 'password',
    ssh_username: 'scanner',
    ssh_port: '2222',
    ssh_password: 'temporary-test-password',
    ssh_host_key_algorithm: 'ssh-ed25519',
    ssh_host_key_fingerprint: 'SHA256:nThbg6kXUpJWGl7eW5ekUu6ktAi8GpmKgsBbBKuPd0Q',
    ssh_allowed_cidr: '10.20.0.0/16',
    ssh_root_path: '/srv/shore-sentinel',
  }, operatorRequest);
  if (previous === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY;
  else process.env.SHORE_SENTINEL_SECRET_KEY = previous;
  assert.equal(result.ssh_auth_method, 'password');
  assert.equal(result.ssh_port, 2222);
  assert.equal(result.ssh_username, 'scanner');
  assert.equal(result.ssh_credential_id, 'credential-1');
  assert.ok(calls.some((sql) => sql.includes('INSERT INTO credentials')));
  const enrollmentInsert = calls.find((sql) => sql.includes('INSERT INTO ssh_host_key_pins'));
  assert.ok(enrollmentInsert, 'successful SSH enrollment must persist its host-key pin');
  assert.match(enrollmentInsert, /INSERT INTO ssh_host_key_pins \(tenant_id,target_id,ssh_port,algorithm,fingerprint,verified_by\)/);
  assert.match(enrollmentInsert, /INSERT INTO target_egress_policies \(tenant_id,target_id,cidr,ssh_port\)/);
  assert.match(enrollmentInsert, /INSERT INTO target_root_policies \(tenant_id,target_id,root_path\)/);
  const enrollmentCall = queryCalls.find(({ sql }) => sql.includes('INSERT INTO ssh_host_key_pins'));
  assert.ok(enrollmentCall);
  assert.deepEqual(enrollmentCall.params.slice(15), ['ssh-ed25519', 'SHA256:nThbg6kXUpJWGl7eW5ekUu6ktAi8GpmKgsBbBKuPd0Q', 'operator-1', '10.20.0.0/16', '/srv/shore-sentinel']);
  assert.match(String(enrollmentCall.params[3]), /^v1:/);
  assert.notEqual(enrollmentCall.params[3], 'temporary-test-password');
});

test('create target rejects malformed SSH enrollment controls before persisting credentials or targets', async () => {
  const request = operatorRequest;
  for (const [field, value, message] of [
    ['ssh_host_key_algorithm', ' ssh-ed25519 ', /must be ssh-ed25519/],
    ['ssh_host_key_fingerprint', ' SHA256:nThbg6kXUpJWGl7eW5ekUu6ktAi8GpmKgsBbBKuPd0Q ', /canonical ssh-ed25519 SHA256 fingerprint/],
    ['ssh_allowed_cidr', '10.20.0.0/33', /valid IPv4 CIDR/],
    ['ssh_root_path', 'srv/shore-sentinel', /absolute enrolled root/],
  ] as const) {
    const { app, calls } = controller();
    await assert.rejects(() => app.createTarget({
      hostname: 'alpha-ws-01',
      connection_mode: 'ssh_push',
      ssh_auth_method: 'password',
      ssh_username: 'scanner',
      ssh_password: 'temporary-test-password',
      ssh_host_key_algorithm: 'ssh-ed25519',
      ssh_host_key_fingerprint: 'SHA256:nThbg6kXUpJWGl7eW5ekUu6ktAi8GpmKgsBbBKuPd0Q',
      ssh_allowed_cidr: '10.20.0.0/16',
      ssh_root_path: '/srv/shore-sentinel',
      [field]: value,
    }, request), message);
    assert.equal(calls.some((sql) => /INSERT INTO (credentials|targets|ssh_host_key_pins|target_egress_policies|target_root_policies)/.test(sql)), false);
  }
});

test('create target rejects unrestricted SSH egress CIDRs before persisting enrollment', async () => {
  const request = operatorRequest;
  for (const ssh_allowed_cidr of ['0.0.0.0/0', '203.0.113.42/0']) {
    const { app, calls } = controller();
    await assert.rejects(() => app.createTarget({
      hostname: 'alpha-ws-01',
      connection_mode: 'ssh_push',
      ssh_auth_method: 'password',
      ssh_username: 'scanner',
      ssh_password: 'temporary-test-password',
      ssh_host_key_algorithm: 'ssh-ed25519',
      ssh_host_key_fingerprint: 'SHA256:nThbg6kXUpJWGl7eW5ekUu6ktAi8GpmKgsBbBKuPd0Q',
      ssh_allowed_cidr,
      ssh_root_path: '/srv/shore-sentinel',
    }, request), /must not permit unrestricted IPv4 CIDRs/);
    assert.equal(calls.some((sql) => /INSERT INTO (credentials|targets|ssh_host_key_pins|target_egress_policies|target_root_policies)/.test(sql)), false);
  }
});

test('remediation status mutation persists every canonical schema status', async () => {
  const { app } = controller();
  for (const status of ['open', 'accepted', 'ignored', 'resolved']) {
    const result = await app.updateRemediationStatus('remediation-1', { status }, operatorRequest);
    assert.equal(result.status, status);
  }
});

test('remediation status mutation rejects non-schema business labels', async () => {
  const { app } = controller();
  for (const status of ['needs_review', 'in_progress', 'fixed', 'accepted_risk']) {
    await assert.rejects(() => app.updateRemediationStatus('remediation-1', { status }, operatorRequest), /invalid status/);
  }
});

test('API mutations enforce role matrix permissions before changing users, targets, or remediation', async () => {
  const { app } = controller();
  const admin = adminRequest;
  const operator = operatorRequest;
  const analyst = analystRequest;
  const viewer = viewerRequest;

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

test('worker artifact handoff reserves the canonical artifact location before storing bytes', async () => {
  const { app, queueCalls, artifactStores } = controller();
  const result = await app.workerArtifact({
    runId: 'run-1',
    kind: ARTIFACT_KIND.scannerRawOutput,
    contentType: 'application/json',
    bodyBase64: Buffer.from(JSON.stringify({ ok: true })).toString('base64'),
  }, workerRequest());
  assert.equal(result.artifact_type, ARTIFACT_KIND.scannerRawOutput);
  assert.deepEqual(artifactStores, [{ storageUri: 's3://bucket/runs/run-1/stored.scanner.raw_output', body: Buffer.from(JSON.stringify({ ok: true })), contentType: 'application/json' }]);
  assert.match(String(result.storage_uri), /^s3:\/\//);
  assert.equal(queueCalls.length, 0);
});

test('worker artifact handoff rejects non-canonical base64 before storage or database allocation', async () => {
  const { app, artifactStores, calls } = controller();
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, contentType: 'application/json', bodyBase64: 'TQ=',
  }, workerRequest()), /canonical base64/);
  assert.equal(artifactStores.length, 0);
  assert.equal(calls.some((sql) => sql.includes('INSERT INTO artifacts')), false);
});

test('worker event and artifact writes require the per-run capability after worker-token authentication', async () => {
  const { app, calls, artifactStores } = controller();
  await assert.rejects(() => app.workerEvent('run-1', { type: 'job.running', attempt: 1 }, workerRequest('wrong-capability')), /Worker capability unavailable/);
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('ok').toString('base64'),
  }, workerRequest('wrong-capability')), /Worker capability unavailable/);
  assert.equal(artifactStores.length, 0);
  assert.equal(calls.some((sql) => sql.includes('job_events')), false);
});

test('worker capability and every worker write guard require an unexpired grant', async () => {
  const { app, calls } = controller();
  await app.workerEvent('run-1', { type: 'job.running', attempt: 1 }, workerRequest());
  await app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('ok').toString('base64'),
  }, workerRequest());
  const workerCapabilityQueries = calls.filter((sql) => sql.includes('SELECT g.id AS grant_id') && sql.includes('worker_execution_grants'));
  const workerWriteGuards = calls.filter((sql) => (sql.includes('INSERT INTO job_events') && sql.includes('SELECT $1')) || sql.includes('INSERT INTO artifacts'));
  assert.equal(workerCapabilityQueries.length, 2);
  assert.equal(workerWriteGuards.length, 3);
  for (const sql of [...workerCapabilityQueries, ...workerWriteGuards]) assert.match(sql, /g\.expires_at > now\(\)/);
});

test('worker artifact handoff does not store bytes when the authorization-backed reservation is rejected', async () => {
  const { app, artifactStores, artifactDeletes } = controller({ inactiveArtifact: true });
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('ok').toString('base64'),
  }, workerRequest()), /Worker capability unavailable/);
  assert.equal(artifactStores.length, 0);
  assert.deepEqual(artifactDeletes, []);
});

test('worker artifact handoff queues durable reconciliation when authorization is revoked after storage', async () => {
  const { app, artifactStores, queueCalls, operationOrder, calls } = controller({ inactiveAfterStore: true });
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('ok').toString('base64'),
  }, workerRequest()), /Worker capability unavailable/);
  assert.equal(artifactStores.length, 1);
  assert.deepEqual(queueCalls, [{ queueName: 'artifact_processing', payload: { type: 'artifact.cleanup', tenantId: 'tenant-1', runId: 'run-1' } }]);
  assert.ok(operationOrder.indexOf('cleanup-persisted') < operationOrder.indexOf('queue:artifact_processing'));
  assert.ok(calls.some((sql) => sql.includes('artifact_cleanup_work')));
});

test('terminal cancellation serializes with artifact admission, revokes active grants, and quarantines artifacts for cleanup', async () => {
  const { app, calls } = controller();
  await app.cancelRun('run-1', { reason: 'operator request' }, operatorRequest);
  const cancellation = calls.find((sql) => sql.includes('WITH locked_run'));
  assert.ok(cancellation, 'cancellation must use one serialized run-state transition');
  assert.match(cancellation, /FROM scan_runs[\s\S]*FOR UPDATE/);
  assert.match(cancellation, /UPDATE worker_execution_grants[\s\S]*revoked_at=now\(\)[\s\S]*revoked_at IS NULL/);
  assert.match(cancellation, /DELETE FROM scan_dispatch_outbox[\s\S]*published_at IS NULL/);
  assert.doesNotMatch(cancellation, /consumed_at IS NULL/);
  assert.match(cancellation, /UPDATE artifacts[\s\S]*parse_status='quarantined'/);
  assert.match(cancellation, /DELETE FROM job_events[\s\S]*event_type='artifact\.uploaded'/);
});

test('terminal cancellation is idempotent and emits its audit event only for the first state transition', async () => {
  const { app, calls } = controller();
  const request = operatorRequest;
  await app.cancelRun('run-1', { reason: 'operator request' }, request);
  await app.cancelRun('run-1', { reason: 'operator request' }, request);
  const cancellation = calls.filter((sql) => sql.includes('WITH locked_run'));
  assert.equal(cancellation.length, 2);
  for (const sql of cancellation) {
    assert.match(sql, /newly_cancelled AS \([\s\S]*status <> 'cancelled'/);
    assert.match(sql, /scan\.cancelled[\s\S]*FROM newly_cancelled/);
  }
});

test('cancellation persists quarantined artifact cleanup work before an object deletion attempt can fail', async () => {
  const { app, calls, queueCalls, operationOrder } = controller({ artifactDeleteFails: true });
  const request = operatorRequest;
  await assert.doesNotReject(() => app.cancelRun('run-1', { reason: 'operator request' }, request));
  const cancellation = calls.find((sql) => sql.includes('WITH locked_run'));
  assert.ok(cancellation);
  assert.match(cancellation, /UPDATE artifacts[\s\S]*parse_status='quarantined'/);
  assert.match(cancellation, /INSERT INTO artifact_cleanup_work/);
  assert.deepEqual(queueCalls, [{ queueName: 'artifact_processing', payload: { type: 'artifact.cleanup', tenantId: 'tenant-1', runId: 'run-1' } }]);
  assert.ok(operationOrder.indexOf('cleanup-persisted') < operationOrder.indexOf('queue:artifact_processing'));
});

test('failed finalization compensation records durable cleanup work before its object deletion can fail', async () => {
  const { app, calls } = controller({ inactiveAfterStore: true, artifactDeleteFails: true });
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('compensation').toString('base64'),
  }, workerRequest()), /Worker capability unavailable/);
  const compensation = calls.find((sql) => sql.includes("UPDATE artifacts SET parse_status='quarantined'"));
  assert.ok(compensation);
  assert.match(compensation, /INSERT INTO artifact_cleanup_work/);
});

test('cancellation after the final artifact authorization cannot leave an uploaded event or accepted metadata', async () => {
  const { app, calls, artifactStores } = controller();
  await app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('final-authorization-race').toString('base64'),
  }, workerRequest());
  assert.equal(artifactStores.length, 1);
  const finalization = calls.find((sql) => sql.includes('finalized_artifact'));
  assert.ok(finalization, 'artifact finalization must lock the run and atomically publish metadata/event');
  assert.match(finalization, /FROM scan_runs[\s\S]*FOR UPDATE/);
  assert.match(finalization, /UPDATE artifacts[\s\S]*parse_status='uploaded'/);
  assert.match(finalization, /INSERT INTO job_events[\s\S]*artifact\.uploaded[\s\S]*FROM finalized_artifact/);
  assert.doesNotMatch(finalization, /SELECT 1 AS active/);
});

test('cancellation-finalization race queues durable cleanup without accepting metadata or emitting artifact.uploaded', async () => {
  const { app, calls, queueCalls, operationOrder } = controller({ inactiveAfterStore: true });
  await assert.rejects(() => app.workerArtifact({
    runId: 'run-1', kind: ARTIFACT_KIND.scannerRawOutput, bodyBase64: Buffer.from('cancelled-before-finalization').toString('base64'),
  }, workerRequest()), /Worker capability unavailable/);
  assert.deepEqual(queueCalls, [{ queueName: 'artifact_processing', payload: { type: 'artifact.cleanup', tenantId: 'tenant-1', runId: 'run-1' } }]);
  assert.ok(operationOrder.indexOf('cleanup-persisted') < operationOrder.indexOf('queue:artifact_processing'));
  const finalization = calls.find((sql) => sql.includes('finalized_artifact'));
  assert.ok(finalization);
  assert.match(finalization, /UPDATE artifacts[\s\S]*parse_status='uploaded'/);
  assert.match(finalization, /INSERT INTO job_events[\s\S]*'artifact\.uploaded'[\s\S]*FROM finalized_artifact/);
  const compensation = calls.find((sql) => sql.includes("UPDATE artifacts SET parse_status='quarantined'"));
  assert.ok(compensation);
  assert.match(compensation, /INSERT INTO artifact_cleanup_work/);
});
