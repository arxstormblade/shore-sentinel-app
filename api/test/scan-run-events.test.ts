import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

type EventEndpoint = (id: string, req: unknown) => Promise<{ events: unknown[] }>;

function eventsEndpoint(app: AppController): EventEndpoint {
  return (app as unknown as { events: EventEndpoint }).events.bind(app);
}

test('scan-run events require scan live-progress read permission before querying event data', async () => {
  let queryCount = 0;
  const db = {
    tenantId: async () => 'tenant-current',
    query: async () => {
      queryCount += 1;
      return { rows: [] };
    },
  };
  const auth = {
    me: async () => ({ id: 'blocked-user', roles: [] }),
  };
  const app = new AppController(db as never, auth as never, {} as never, {} as never, {} as never);
  const request = { principal: { userId: 'blocked-user', tenantId: 'tenant-current', roles: [] }, header: () => undefined } as never;

  await assert.rejects(() => eventsEndpoint(app)('run-current', request), /Insufficient permissions/);
  assert.equal(queryCount, 0);
});

test('scan-run events query is scoped to the current tenant and requested run', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    tenantId: async () => 'tenant-current',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const auth = {
    me: async () => ({ id: 'viewer-user', roles: ['viewer'] }),
  };
  const app = new AppController(db as never, auth as never, {} as never, {} as never, {} as never);
  const request = { principal: { userId: 'viewer-user', tenantId: 'tenant-current', roles: ['viewer'] }, header: () => undefined } as never;

  await eventsEndpoint(app)('run-current', request);

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM job_events e/);
  assert.match(calls[0].sql, /e\.tenant_id\s*=\s*\$1/);
  assert.match(calls[0].sql, /e\.run_id\s*=\s*\$2/);
  assert.deepEqual(calls[0].params.slice(0, 2), ['tenant-current', 'run-current']);
});

test('scan-run events cannot return a requested run owned by another tenant', async () => {
  const crossTenantRun = 'run-owned-by-tenant-other';
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    tenantId: async () => 'tenant-current',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (params[0] === 'tenant-current' && params[1] === crossTenantRun) return { rows: [] };
      return { rows: [{ event_type: 'job.failed', message: 'cross-tenant raw error: secret', payload: { credential: 'secret' } }] };
    },
  };
  const auth = {
    me: async () => ({ id: 'viewer-user', roles: ['viewer'] }),
  };
  const app = new AppController(db as never, auth as never, {} as never, {} as never, {} as never);
  const request = { principal: { userId: 'viewer-user', tenantId: 'tenant-current', roles: ['viewer'] }, header: () => undefined } as never;

  assert.deepEqual(await eventsEndpoint(app)(crossTenantRun, request), { events: [] });
  assert.deepEqual(calls[0].params.slice(0, 2), ['tenant-current', crossTenantRun]);
});

test('scan-run events return only normalized browser-safe live-progress fields', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const rawWorkerMessage = 'scanner failed: password=super-secret response=https://internal.example/runs/run-internal';
  const rawWorkerPayload = {
    credential: 'super-secret',
    response_text: 'Authorization: Bearer private-token',
    runtime_context: { host: '10.0.0.7', uri: 's3://private-bucket/runs/run-internal' },
    internal_id: 'grant-internal',
  };
  const db = {
    tenantId: async () => 'tenant-current',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return {
        rows: [
          {
            id: 'event-internal', tenant_id: 'tenant-current', job_id: 'job-internal', run_id: 'run-current',
            event_type: 'job.running', status: 'running', progress_percent: 42,
            message: rawWorkerMessage, payload: rawWorkerPayload, created_at: '2026-07-20T10:00:00.000Z',
          },
          {
            id: 'event-unknown', tenant_id: 'tenant-current', run_id: 'run-current', event_type: 'worker.debug',
            progress_percent: 99, message: rawWorkerMessage, payload: rawWorkerPayload, created_at: '2026-07-20T10:01:00.000Z',
          },
        ],
      };
    },
  };
  const auth = {
    me: async () => ({ id: 'viewer-user', roles: ['viewer'] }),
  };
  const app = new AppController(db as never, auth as never, {} as never, {} as never, {} as never);
  const request = { principal: { userId: 'viewer-user', tenantId: 'tenant-current', roles: ['viewer'] }, header: () => undefined } as never;

  const result = await eventsEndpoint(app)('run-current', request);

  assert.deepEqual(result, {
    events: [{
      event_type: 'job.running', status: 'running', progress_percent: 42,
      created_at: '2026-07-20T10:00:00.000Z', message: 'Scan is running',
    }],
  });
  assert.doesNotMatch(calls[0].sql, /SELECT\s+\*/i);
  assert.doesNotMatch(calls[0].sql, /e\.(payload|message|id|job_id|storage_uri|runtime_context)\b/i);
  const serialized = JSON.stringify(result);
  for (const secret of ['super-secret', 'private-token', 'internal.example', 'grant-internal', 's3://private-bucket', rawWorkerMessage]) {
    assert.equal(serialized.includes(secret), false, `browser response must not include ${secret}`);
  }
});
