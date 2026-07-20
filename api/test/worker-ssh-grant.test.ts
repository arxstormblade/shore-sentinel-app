import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { AppController } from '../src/app.controller.js';

const SECRET_KEY = 'test-only-worker-secret-key-with-at-least-32-bytes';

function seal(plaintext: string) {
  const key = createHash('sha256').update(SECRET_KEY).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${ciphertext.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}`;
}

function appWithGrant(row: Record<string, unknown> | null) {
  const calls: string[] = [];
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string) => {
      calls.push(sql);
      if (sql === 'SELECT tenant_id FROM scan_runs WHERE id=$1') return { rows: [{ tenant_id: 'tenant-1' }] };
      if (sql.includes('consumed_grant')) return { rows: row ? [row] : [] };
      if (sql.includes('SELECT status, cancellation_requested_at')) return { rows: [{ status: 'running', cancellation_requested_at: null }] };
      return { rows: [] };
    },
  };
  return {
    app: new AppController(db as never, {} as never, {} as never, {} as never, {} as never),
    calls,
  };
}

const request = (token = 'worker-token') => ({ header: (name: string) => name === 'authorization' ? `Bearer ${token}` : undefined }) as never;

const validGrant = () => ({
  grant_id: 'grant-1',
  grant_expires_at: new Date(Date.now() + 60_000).toISOString(),
  grant_revoked_at: null,
  grant_consumed_at: null,
  retry_max_attempts: 3,
  run_id: 'run-1',
  run_status: 'pending',
  cancellation_requested_at: null,
  hostname: '10.20.30.40',
  ssh_port: 22,
  ssh_username: 'scanner',
  ssh_credential_id: 'credential-1',
  ssh_auth_method: 'password',
  sealed_secret: seal(JSON.stringify({ auth_method: 'password', hostname: '10.20.30.40', port: 22, username: 'scanner', secret: 'never-log-this' })),
  credential_disabled_at: null,
  fingerprint: 'SHA256:pinned-host-key',
  algorithm: 'ssh-ed25519',
  host_key_revoked_at: null,
  cidr: '10.20.0.0/16',
  policy_port: 22,
  policy_enabled: true,
  root_path: '/srv/shore-sentinel',
  root_enabled: true,
});

test('internal worker SSH grant endpoint authenticates, atomically consumes, and decrypts only its response', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const { app, calls } = appWithGrant(validGrant());

  const grant = await app.workerSshGrant('run-1', { attempt: 1 }, request());

  assert.deepEqual(grant, {
    runId: 'run-1',
    grantId: 'grant-1',
    attempt: 1,
    maxAttempts: 3,
    host: '10.20.30.40',
    port: 22,
    hostKeyPin: 'SHA256:pinned-host-key',
    permittedCidrs: ['10.20.0.0/16'],
    enrolledRoot: '/srv/shore-sentinel',
    scanTarget: '.',
    workerCapability: createHmac('sha256', SECRET_KEY).update('run-1:grant-1').digest('base64url'),
    credential: { username: 'scanner', password: 'never-log-this' },
  });
  assert.equal(calls.filter((sql) => sql.includes('consumed_grant')).length, 1);
  assert.equal(calls.some((sql) => sql === 'SELECT tenant_id FROM scan_runs WHERE id=$1'), false, 'tenant scope must be derived inside the grant transition, not by a racy preflight lookup');
  assert.match(calls.find((sql) => sql.includes('consumed_grant'))!, /SELECT sr\.id, sr\.tenant_id, sr\.job_id/);
  assert.match(calls.find((sql) => sql.includes('consumed_grant'))!, /cancellation_requested_at IS NULL/);
  assert.match(calls.find((sql) => sql.includes('consumed_grant'))!, /g\.expires_at AS grant_expires_at/);
  assert.match(calls.find((sql) => sql.includes('consumed_grant'))!, /g\.revoked_at AS grant_revoked_at/);
  assert.match(calls.find((sql) => sql.includes('consumed_grant'))!, /p\.revoked_at AS host_key_revoked_at/);

  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});

test('internal worker SSH grant endpoint refuses an invalid worker token without reading a grant', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  const { app, calls } = appWithGrant(validGrant());
  await assert.rejects(() => app.workerSshGrant('run-1', { attempt: 1 }, request('wrong-token')), /Internal worker authentication failed/);
  assert.equal(calls.length, 0);
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
});

test('internal worker SSH grant endpoint rejects cancelled, revoked, expired, terminal, or malformed controls without releasing a credential', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const rejectedRows: Array<[string, Record<string, unknown> | null]> = [
    ['missing grant', null],
    ['cancelled run', { ...validGrant(), cancellation_requested_at: new Date().toISOString() }],
    ['terminal run', { ...validGrant(), run_status: 'completed' }],
    ['revoked grant', { ...validGrant(), grant_revoked_at: new Date().toISOString() }],
    ['revoked host key', { ...validGrant(), host_key_revoked_at: new Date().toISOString() }],
    ['expired grant', { ...validGrant(), grant_expires_at: new Date(Date.now() - 1).toISOString() }],
    ['legacy revoked field', { ...validGrant(), revoked_at: new Date().toISOString() }],
    ['legacy expiry field', { ...validGrant(), expires_at: new Date(Date.now() + 60_000).toISOString() }],
    ['missing expiry control', (() => { const { grant_expires_at: _grantExpiresAt, ...row } = validGrant(); return row; })()],
    ['missing host key control', { ...validGrant(), fingerprint: null }],
  ];
  for (const [description, row] of rejectedRows) {
    const { app } = appWithGrant(row);
    await assert.rejects(() => app.workerSshGrant('run-1', { attempt: 1 }, request()), /SSH execution grant unavailable|SSH launch denied/, description);
  }
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});

test('internal worker run control reports cancellation to workers using the internal token', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  const { app } = appWithGrant(validGrant());
  assert.deepEqual(await app.workerRunControl('run-1', request()), { runId: 'run-1', cancelled: false });
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
});

test('SSH grant is inactive while queued and starts its short credential lifetime only when atomically claimed', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const { app, calls } = appWithGrant(validGrant());
  await app.workerSshGrant('run-1', { attempt: 1 }, request());
  const claim = calls.find((sql) => sql.includes('consumed_grant'))!;
  const freshClaim = claim.slice(claim.indexOf('), consumed_grant AS ('), claim.indexOf('), active_consumed_grant AS ('));
  assert.match(claim, /SET consumed_at=now\(\), expires_at=now\(\)\+\(\$2 \* interval '1 millisecond'\)/);
  assert.match(freshClaim, /g\.attempt=\$3/);
  assert.match(freshClaim, /g\.consumed_at IS NULL[\s\S]*g\.revoked_at IS NULL[\s\S]*g\.expires_at IS NULL/);
  assert.match(freshClaim, /sr\.status='pending'[\s\S]*sr\.cancellation_requested_at IS NULL[\s\S]*sj\.status='queued'/);
  assert.doesNotMatch(freshClaim, /g\.expires_at > now\(\)/);
  assert.doesNotMatch(freshClaim, /interval '60 seconds'/);
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});

test('SSH grant claim uses the validated full execution budget rather than a fixed SSH-only minute', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const { app, calls } = appWithGrant(validGrant());

  await app.workerSshGrant('run-1', { attempt: 1 }, request());

  const claim = calls.find((sql) => sql.includes('consumed_grant'))!;
  assert.match(claim, /expires_at=now\(\)\+\(\$2 \* interval '1 millisecond'\)/);
  assert.doesNotMatch(claim, /interval '60 seconds'/);

  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});

test('SSH grant uses the persisted retry policy in its locked job query instead of a process environment value', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  const previousAttempts = process.env.WORKER_MAX_ATTEMPTS;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  process.env.WORKER_MAX_ATTEMPTS = '1';
  const { app, calls } = appWithGrant(validGrant());
  const grant = await app.workerSshGrant('run-1', { attempt: 1 }, request());
  assert.equal(grant.maxAttempts, 3);
  const claim = calls.find((sql) => sql.includes('consumed_grant'))!;
  assert.match(claim, /sj\.retry_max_attempts/);
  assert.doesNotMatch(claim, /maxAttempts/);
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
  if (previousAttempts === undefined) delete process.env.WORKER_MAX_ATTEMPTS; else process.env.WORKER_MAX_ATTEMPTS = previousAttempts;
});

test('an unexpired active grant replays its exact capability only for its same active attempt without a write', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const { app, calls } = appWithGrant({ ...validGrant(), grant_consumed_at: new Date().toISOString() });

  const replay = await app.workerSshGrant('run-1', { attempt: 1 }, request());
  const duplicateReplay = await app.workerSshGrant('run-1', { attempt: 1 }, request());

  assert.equal(replay.grantId, 'grant-1');
  assert.deepEqual(duplicateReplay, replay);
  const claim = calls.find((sql) => sql.includes('consumed_grant'))!;
  const activeReplay = claim.slice(claim.indexOf('), active_consumed_grant AS ('), claim.indexOf('), recovered_context AS ('));
  assert.match(activeReplay, /g\.attempt=\$3[\s\S]*g\.consumed_at IS NOT NULL[\s\S]*g\.expires_at > now\(\)[\s\S]*g\.revoked_at IS NULL/);
  assert.match(activeReplay, /sr\.subject_type='managed_target'[\s\S]*sr\.status='pending'[\s\S]*sr\.cancellation_requested_at IS NULL[\s\S]*sj\.status='queued'/);
  assert.doesNotMatch(activeReplay, /UPDATE worker_execution_grants|SET consumed_at/);
  assert.match(claim, /SELECT \* FROM consumed_grant UNION ALL SELECT \* FROM active_consumed_grant UNION ALL SELECT \* FROM recovered_context/);
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});

test('SSH grant recovery only creates the exact next BullMQ attempt after an expired consumed grant', async () => {
  const previous = process.env.INTERNAL_WORKER_TOKEN;
  const previousSecret = process.env.SHORE_SENTINEL_SECRET_KEY;
  process.env.INTERNAL_WORKER_TOKEN = 'worker-token';
  process.env.SHORE_SENTINEL_SECRET_KEY = SECRET_KEY;
  const { app, calls } = appWithGrant(validGrant());
  await app.workerSshGrant('run-1', { attempt: 1 }, request());
  const claim = calls.find((sql) => sql.includes('consumed_grant'))!;
  assert.match(claim, /lr\.retry_count=\$3-2/);
  assert.match(claim, /previous\.consumed_at IS NOT NULL AND previous\.revoked_at IS NULL AND previous\.expires_at <= now\(\)/);
  assert.match(claim, /\$3 > 1 AND \$3 <= lr\.retry_max_attempts/);
  assert.match(claim, /sr\.cancellation_requested_at IS NULL[\s\S]*sj\.status IN \('queued','leased','running'\)/);
  assert.match(claim, /sr\.status IN \('leased','running'\)[\s\S]*lr\.retry_count=\$3-2/);
  assert.match(claim, /NOT EXISTS \(SELECT 1 FROM worker_execution_grants current[\s\S]*current\.attempt=\$3\)/);
  assert.match(claim, /UPDATE scan_jobs sj SET status='queued', retry_count=sj\.retry_count\+1/);
  assert.match(claim, /INSERT INTO job_events[\s\S]*'job\.retry_scheduled'/);
  assert.match(claim, /INSERT INTO worker_execution_grants \(tenant_id,run_id,worker_id,action,attempt,expires_at,consumed_at\)/);
  assert.match(claim, /recovered_consumed_grant/);
  assert.match(claim, /SELECT \* FROM consumed_grant UNION ALL SELECT \* FROM active_consumed_grant UNION ALL SELECT \* FROM recovered_context/);
  assert.match(claim, /sr\.cancellation_requested_at IS NULL/);
  if (previous === undefined) delete process.env.INTERNAL_WORKER_TOKEN; else process.env.INTERNAL_WORKER_TOKEN = previous;
  if (previousSecret === undefined) delete process.env.SHORE_SENTINEL_SECRET_KEY; else process.env.SHORE_SENTINEL_SECRET_KEY = previousSecret;
});
