import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';
import { OUTBOX_RETRY_BASE_MS, OUTBOX_RETRY_MAX_DELAY_MS, QueueService, SAFE_OUTBOX_DELIVERY_ATTEMPTS, scanDispatchJobOptions, scanDispatchRetryDelayMs, workerRetryPolicyFromEnv } from '../src/queue.service.js';
import { SCHEMA_SQL } from '../src/schema.js';

type QueryCall = { sql: string; params: unknown[] };

const operatorRequest = { principal: { userId: 'operator-1', tenantId: 'tenant-1', roles: ['operator'] }, header: () => undefined } as never;

function dispatchController(options: { failBeforeDispatchBoundary?: boolean } = {}) {
  const calls: QueryCall[] = [];
  const durableWrites: string[] = [];
  const queueCalls: unknown[] = [];
  const deliveryCalls: string[] = [];
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM targets t') && sql.includes('ssh_host_key_pins')) {
        return { rows: [{ hostname: '10.20.30.40', ssh_port: 22, ssh_credential_id: 'credential-1', credential_disabled_at: null, algorithm: 'ssh-ed25519', fingerprint: 'SHA256:valid-pinned-host-key', revoked_at: null, cidr: '10.20.0.0/16', policy_port: 22, policy_enabled: true, root_path: '/srv/shore-sentinel', root_enabled: true }] };
      }
      if (sql.includes('INSERT INTO scan_dispatch_outbox')) {
        if (options.failBeforeDispatchBoundary) throw new Error('simulated database failure before dispatch boundary');
        durableWrites.push(sql);
        return { rows: [{
          job: { id: 'job-1', tenant_id: 'tenant-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null, status: 'queued' },
          run: { id: 'run-1', job_id: 'job-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null, status: 'pending', runtime_context: params[7] },
          dispatch_id: 'outbox-1',
        }] };
      }
      if (sql.includes('INSERT INTO scan_jobs') || sql.includes('INSERT INTO scan_runs') || sql.includes('INSERT INTO worker_execution_grants') || sql.includes('INSERT INTO job_events')) {
        if (options.failBeforeDispatchBoundary && sql.includes('INSERT INTO scan_runs')) throw new Error('simulated database failure before dispatch boundary');
        durableWrites.push(sql);
      }
      if (sql.includes('INSERT INTO scan_jobs')) return { rows: [{ id: 'job-1', tenant_id: 'tenant-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null, status: 'queued' }] };
      if (sql.includes('INSERT INTO scan_runs')) return { rows: [{ id: 'run-1', job_id: 'job-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null, status: 'pending', runtime_context: params[5] }] };
      return { rows: [] };
    },
  };
  const auth = { me: async () => ({ id: 'operator-1', roles: ['operator'] }) };
  const queue = {
    enqueue: async (...args: unknown[]) => { queueCalls.push(args); return { queued: true }; },
    deliverScanDispatch: async (id: string) => { deliveryCalls.push(id); return { queued: true, published: true }; },
    health: async () => ({ configured: false }),
  };
  const app = new AppController(db as never, auth as never, queue as never, {} as never, {} as never);
  return { app, calls, durableWrites, queueCalls, deliveryCalls };
}

const opaqueDispatch = { id: 'outbox-1', tenant_id: 'tenant-1', job_id: 'job-1', run_id: 'run-1', queue_type: 'scan_jobs', retry_max_attempts: 4, retry_backoff_ms: 2500, payload: { id: 'job-1', jobId: 'job-1', runId: 'run-1', run_id: 'run-1', subjectType: 'managed_target', subject_type: 'managed_target', targetId: 'target-1', target_id: 'target-1', oneTimeAuditId: null, one_time_audit_id: null } };

test('scan dispatches use the validated worker retry policy', () => {
  assert.deepEqual(workerRetryPolicyFromEnv({ WORKER_MAX_ATTEMPTS: '4', WORKER_BACKOFF_MS: '2500' }), {
    attempts: 4,
    backoff: { type: 'exponential', delay: 2500 },
  });
  assert.deepEqual(scanDispatchJobOptions('outbox-1', { WORKER_MAX_ATTEMPTS: '4', WORKER_BACKOFF_MS: '2500' }), {
    jobId: 'outbox-1',
    attempts: 4,
    backoff: { type: 'exponential', delay: 2500 },
  });
  assert.throws(() => workerRetryPolicyFromEnv({ WORKER_MAX_ATTEMPTS: '0', WORKER_BACKOFF_MS: '2500' }), /WORKER_MAX_ATTEMPTS/);
  assert.throws(() => workerRetryPolicyFromEnv({ WORKER_MAX_ATTEMPTS: '11', WORKER_BACKOFF_MS: '2500' }), /WORKER_MAX_ATTEMPTS/);
  assert.throws(() => workerRetryPolicyFromEnv({ WORKER_MAX_ATTEMPTS: '4', WORKER_BACKOFF_MS: '0' }), /WORKER_BACKOFF_MS/);
  assert.throws(() => workerRetryPolicyFromEnv({ WORKER_MAX_ATTEMPTS: '4', WORKER_BACKOFF_MS: '3600001' }), /WORKER_BACKOFF_MS/);
});

test('scan creation persists its validated retry policy and dispatch delivery passes that stored policy to BullMQ', async () => {
  const previousAttempts = process.env.WORKER_MAX_ATTEMPTS;
  const previousBackoff = process.env.WORKER_BACKOFF_MS;
  process.env.WORKER_MAX_ATTEMPTS = '4';
  process.env.WORKER_BACKOFF_MS = '2500';
  try {
    const { app, calls } = dispatchController();
    await app.runTarget('target-1', { scan_target: '/srv/shore-sentinel' }, operatorRequest);
    const creation = calls.find(({ sql }) => sql.includes('INSERT INTO scan_dispatch_outbox'));
    assert.ok(creation);
    assert.match(creation.sql, /INSERT INTO scan_jobs \(tenant_id,subject_type,target_id,one_time_audit_id,requested_by,mode,priority,scanner_version,status,retry_max_attempts,retry_backoff_ms\)/);
    assert.deepEqual(creation.params.slice(-3), [4, 2500, 'operator-1']);
  } finally {
    if (previousAttempts === undefined) delete process.env.WORKER_MAX_ATTEMPTS; else process.env.WORKER_MAX_ATTEMPTS = previousAttempts;
    if (previousBackoff === undefined) delete process.env.WORKER_BACKOFF_MS; else process.env.WORKER_BACKOFF_MS = previousBackoff;
  }

  const { queue, enqueues } = outboxQueue();
  await (queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1');
  assert.deepEqual(enqueues[0], ['scan_jobs', opaqueDispatch.payload, 'outbox-1', {
    attempts: 4,
    backoff: { type: 'exponential', delay: 2500 },
  }]);
});

function outboxQueue(options: { enqueueFails?: boolean; enqueueRefuses?: boolean; attemptCount?: number } = {}) {
  const calls: QueryCall[] = [];
  let published = false;
  const queue = new (QueueService as unknown as new (db: unknown) => QueueService)({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM scan_dispatch_outbox')) return { rows: published ? [] : [{ ...opaqueDispatch, attempt_count: options.attemptCount ?? 0 }] };
      if (sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('published_at=now()')) {
        published = true;
        return { rows: [{ id: 'outbox-1' }] };
      }
      return { rows: [] };
    },
  });
  const enqueues: unknown[] = [];
  queue.enqueue = async (...args: unknown[]) => {
    enqueues.push(args);
    if (options.enqueueFails) throw new Error('Redis unavailable');
    if (options.enqueueRefuses) return { queued: false, reason: 'REDIS_URL not configured' };
    return { queued: true, queue: 'shore-sentinel-scan-jobs', jobId: 'outbox-1' };
  };
  return { queue, calls, enqueues };
}

function dueDrainQueue() {
  const calls: QueryCall[] = [];
  const enqueues: unknown[][] = [];
  const queue = new (QueueService as unknown as new (db: unknown) => QueueService)({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT o.id') && sql.includes('ORDER BY COALESCE')) return { rows: [{ id: 'healthy-newer' }] };
      if (sql.includes('SELECT o.id,o.tenant_id,o.run_id')) return { rows: [{ ...opaqueDispatch, id: 'healthy-newer', attempt_count: 0 }] };
      if (sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('published_at=now()')) return { rows: [{ id: 'healthy-newer' }] };
      return { rows: [] };
    },
  });
  queue.enqueue = async (...args: unknown[]) => {
    enqueues.push(args);
    return { queued: true, queue: 'shore-sentinel-scan-jobs', jobId: 'healthy-newer' };
  };
  return { queue, calls, enqueues };
}

function overlappingDrainQueue() {
  const calls: QueryCall[] = [];
  let resolveSelection!: () => void;
  const selectionGate = new Promise<void>((resolve) => { resolveSelection = resolve; });
  let selections = 0;
  const queue = new (QueueService as unknown as new (db: unknown) => QueueService)({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT o.id') && sql.includes('ORDER BY COALESCE')) {
        selections += 1;
        await selectionGate;
        return { rows: [] };
      }
      return { rows: [] };
    },
  });
  return { queue, calls, releaseSelection: () => resolveSelection(), selections: () => selections };
}

test('a failed outbox delivery persists bounded exponential scheduling before its next retry', async () => {
  assert.equal(scanDispatchRetryDelayMs(1), OUTBOX_RETRY_BASE_MS);
  assert.equal(scanDispatchRetryDelayMs(2), OUTBOX_RETRY_BASE_MS * 2);
  assert.equal(scanDispatchRetryDelayMs(99), OUTBOX_RETRY_MAX_DELAY_MS);

  const { queue, calls } = outboxQueue({ enqueueFails: true, attemptCount: 1 });
  await assert.rejects(() => (queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1'), /Redis unavailable/);
  const failure = calls.find(({ sql }) => sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('next_attempt_at=now()'));
  assert.ok(failure, 'a failed delivery must persist a due time rather than becoming immediately eligible again');
  assert.match(failure.sql, /attempt_count=attempt_count\+1[\s\S]*next_attempt_at=now\(\)\+\(\$2 \* interval '1 millisecond'\)/);
  assert.deepEqual(failure.params, ['outbox-1', OUTBOX_RETRY_BASE_MS * 2]);
});

test('the safe outbox delivery maximum persists one terminal failure and an alertable notification event', async () => {
  const { queue, calls } = outboxQueue({ enqueueFails: true, attemptCount: SAFE_OUTBOX_DELIVERY_ATTEMPTS - 1 });
  await assert.rejects(() => (queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1'), /Redis unavailable/);
  const terminal = calls.find(({ sql }) => sql.includes('WITH failed AS'));
  assert.ok(terminal, 'the final failed attempt must persist terminal state instead of scheduling another retry');
  assert.match(terminal.sql, /failed_at=now\(\), last_error='delivery_failed'/);
  assert.match(terminal.sql, /INSERT INTO notification_events[\s\S]*'scan\.dispatch_failed'[\s\S]*'delivery_failed'/);
  assert.deepEqual(terminal.params, ['outbox-1']);
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO scan_runs')), false, 'terminal delivery failure must retain the original durable record rather than creating another run');
});

test('a non-throwing enqueue refusal uses generic durable backoff and terminal delivery failure handling', async () => {
  const retry = outboxQueue({ enqueueRefuses: true, attemptCount: 1 });
  const retryResult = await (retry.queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1');
  assert.deepEqual(retryResult, { published: false, queued: false, reason: 'delivery_failed' });
  const scheduled = retry.calls.find(({ sql }) => sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('next_attempt_at=now()'));
  assert.ok(scheduled, 'a non-throwing refusal must not remain immediately eligible for each timer tick');
  assert.deepEqual(scheduled.params, ['outbox-1', OUTBOX_RETRY_BASE_MS * 2]);
  assert.equal(retry.calls.some(({ sql }) => sql.includes('published_at=now()')), false, 'a refused enqueue must not be marked published');
  assert.equal(retry.calls.some(({ sql }) => sql.includes('INSERT INTO scan_runs')), false, 'a refused enqueue must not create another run');
  assert.doesNotMatch(JSON.stringify({ result: retryResult, calls: retry.calls }), /REDIS_URL not configured/, 'the raw enqueue reason must not enter public or durable state');

  const terminal = outboxQueue({ enqueueRefuses: true, attemptCount: SAFE_OUTBOX_DELIVERY_ATTEMPTS - 1 });
  const terminalResult = await (terminal.queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1');
  assert.deepEqual(terminalResult, { published: false, queued: false, reason: 'delivery_failed' });
  const terminalFailure = terminal.calls.find(({ sql }) => sql.includes('WITH failed AS'));
  assert.ok(terminalFailure, 'the final non-throwing refusal must be terminal and alertable');
  assert.match(terminalFailure.sql, /failed_at=now\(\), last_error='delivery_failed'/);
  assert.match(terminalFailure.sql, /'scan\.dispatch_failed'[\s\S]*'delivery_failed'/);
  assert.equal(terminal.calls.some(({ sql }) => sql.includes('INSERT INTO scan_runs')), false, 'terminal refusal must retain the original durable row');
  assert.doesNotMatch(JSON.stringify({ result: terminalResult, calls: terminal.calls }), /REDIS_URL not configured/, 'the raw enqueue reason must never become durable or public');
});

test('outbox retry state additions are migration-safe for existing durable rows', () => {
  assert.match(SCHEMA_SQL, /ALTER TABLE scan_dispatch_outbox ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz/);
  assert.match(SCHEMA_SQL, /ALTER TABLE scan_dispatch_outbox ADD COLUMN IF NOT EXISTS failed_at timestamptz/);
  assert.match(SCHEMA_SQL, /ALTER TABLE scan_dispatch_outbox ADD COLUMN IF NOT EXISTS last_error text/);
  assert.match(SCHEMA_SQL, /CREATE INDEX IF NOT EXISTS scan_dispatch_outbox_due_idx ON scan_dispatch_outbox\(next_attempt_at,created_at\) WHERE published_at IS NULL AND failed_at IS NULL/);
});

test('drain reconciles only due rows so a newer healthy dispatch is not monopolized by old poison rows', async () => {
  const { queue, calls, enqueues } = dueDrainQueue();
  const result = await (queue as unknown as { drainPendingScanDispatches(limit?: number): Promise<{ attempted: number; published: number }> }).drainPendingScanDispatches(10);
  assert.deepEqual(result, { attempted: 1, published: 1 });
  assert.equal(enqueues.length, 1, 'the newer healthy row selected by the due query must still be dispatchable');
  assert.equal(enqueues[0]?.[2], 'healthy-newer');
  const selection = calls.find(({ sql }) => sql.includes('SELECT o.id') && sql.includes('ORDER BY COALESCE'));
  assert.ok(selection);
  assert.match(selection.sql, /o\.failed_at IS NULL[\s\S]*COALESCE\(o\.next_attempt_at,o\.created_at\) <= now\(\)/);
  assert.match(selection.sql, /ORDER BY COALESCE\(o\.next_attempt_at,o\.created_at\) ASC, o\.created_at ASC/);
  assert.deepEqual(selection.params, [10]);
});

test('timer reconciliation coalesces overlapping drains without bypassing the durable outbox', async () => {
  const { queue, releaseSelection, selections } = overlappingDrainQueue();
  const first = (queue as unknown as { drainPendingScanDispatches(): Promise<unknown> }).drainPendingScanDispatches();
  const second = (queue as unknown as { drainPendingScanDispatches(): Promise<unknown> }).drainPendingScanDispatches();
  assert.equal(selections(), 1, 'the timer must not start a second reconciliation while the first durable selection is pending');
  releaseSelection();
  await Promise.all([first, second]);
});

test('scan job, run, grant, queued event, and pending opaque dispatch are written by one CTE boundary', async () => {
  const { app, calls, queueCalls } = dispatchController();
  await app.runTarget('target-1', { scan_target: '/srv/shore-sentinel' }, operatorRequest);
  const creationWrites = calls.filter(({ sql }) => /INSERT INTO (scan_jobs|scan_runs|worker_execution_grants|job_events|scan_dispatch_outbox)/.test(sql));
  assert.equal(creationWrites.length, 1, 'all durable dispatch state must be one database statement');
  const creation = creationWrites[0]!.sql;
  for (const table of ['scan_jobs', 'scan_runs', 'worker_execution_grants', 'job_events', 'scan_dispatch_outbox']) assert.match(creation, new RegExp(`INSERT INTO ${table}`));
  assert.match(creation, /'job\.queued','Scan job queued',0/);
  assert.equal(queueCalls.length, 0, 'controller must not bypass the durable outbox with a direct enqueue');
});

test('a database failure before the dispatch CTE commits leaves no durable run state or dispatch record', async () => {
  const { app, durableWrites } = dispatchController({ failBeforeDispatchBoundary: true });
  await assert.rejects(() => app.runTarget('target-1', {}, operatorRequest), /simulated database failure/);
  assert.equal(durableWrites.length, 0, 'partial job/run/grant/event writes must not be possible');
});

test('pending scan dispatch payload is opaque and excludes runtime scope, credentials, and artifacts', async () => {
  const { app, calls } = dispatchController();
  await app.runTarget('target-1', { scan_target: '/srv/shore-sentinel', runtime_context: { credential: 'never', artifacts: ['never'] } }, operatorRequest);
  const creation = calls.find(({ sql }) => sql.includes('INSERT INTO scan_dispatch_outbox'));
  assert.ok(creation, 'outbox record must be persisted with the run');
  const dispatchSql = creation.sql.slice(creation.sql.indexOf('INSERT INTO scan_dispatch_outbox'));
  assert.match(dispatchSql, /jsonb_build_object\(\s*'id',.*'jobId',.*'runId',.*'run_id',.*'subjectType',.*'targetId'/s);
  assert.doesNotMatch(dispatchSql, /runtime_context|scan_target|credential|artifact/i);
  assert.match(dispatchSql, /'id',job\.id,'jobId',job\.id,'runId',run\.id,'run_id',run\.id/);
});

test('failed scan dispatch delivery keeps the same outbox row pending for retry without making another scan run', async () => {
  const { queue, calls, enqueues } = outboxQueue({ enqueueFails: true });
  await assert.rejects(() => (queue as unknown as { deliverScanDispatch(id: string): Promise<unknown> }).deliverScanDispatch('outbox-1'), /Redis unavailable/);
  assert.equal(enqueues.length, 1);
  assert.ok(calls.some(({ sql }) => sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('attempt_count')));
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO scan_runs')), false);
  assert.equal(calls.some(({ sql }) => sql.includes('published_at=now()')), false);
});

test('successful scan dispatch delivery enqueues with the outbox id and marks only that pending entry published idempotently', async () => {
  const { queue, calls, enqueues } = outboxQueue();
  const result = await (queue as unknown as { deliverScanDispatch(id: string): Promise<{ published: boolean }> }).deliverScanDispatch('outbox-1');
  const replay = await (queue as unknown as { deliverScanDispatch(id: string): Promise<{ published: boolean }> }).deliverScanDispatch('outbox-1');
  assert.equal(result.published, true);
  assert.equal(replay.published, false);
  assert.deepEqual(enqueues, [['scan_jobs', opaqueDispatch.payload, 'outbox-1', { attempts: 4, backoff: { type: 'exponential', delay: 2500 } }]]);
  const publications = calls.filter(({ sql }) => sql.includes('UPDATE scan_dispatch_outbox') && sql.includes('published_at=now()'));
  assert.equal(publications.length, 1);
  const publication = publications[0];
  assert.ok(publication);
  assert.match(publication.sql, /WHERE id=\$1[\s\S]*published_at IS NULL/);
  assert.deepEqual(publication.params, ['outbox-1']);
  const deliveryGuard = calls.find(({ sql }) => sql.includes('FROM scan_dispatch_outbox'));
  assert.ok(deliveryGuard);
  assert.match(deliveryGuard.sql, /sr\.status='pending'[\s\S]*sr\.cancellation_requested_at IS NULL[\s\S]*sj\.status='queued'/);
});
