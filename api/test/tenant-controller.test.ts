import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

const tenantRequest = {
  principal: { userId: 'user-b', tenantId: 'tenant-b', roles: ['admin'] },
  cookies: { shore_session: 'ignored-by-controller' },
  header: () => undefined,
} as never;

function appWithRecordedQueries() {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    isReady: () => true,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM scan_jobs')) return { rows: [{ id: 'job-b', tenant_id: 'tenant-b' }] };
      if (sql.includes('FROM scan_runs')) return { rows: [{ id: 'run-b', job_id: 'job-b', tenant_id: 'tenant-b', runtime_context: {} }] };
      if (sql.includes('FROM job_events')) return { rows: [] };
      if (sql.includes('FROM users')) return { rows: [{ id: 'user-b', tenant_id: 'tenant-b', roles: ['admin'] }] };
      return { rows: [] };
    },
  };
  const app = new AppController(
    db as never,
    { me: async () => ({ id: 'wrong-user', tenant_id: 'wrong-tenant', roles: ['viewer'] }) } as never,
    { health: async () => ({ configured: false }) } as never,
    {} as never,
    {} as never,
  );
  return { app, calls };
}

test('browser job, run, event, and user reads use the request-bound tenant instead of the database default', async () => {
  const { app, calls } = appWithRecordedQueries();
  await app.job('job-b', tenantRequest);
  await app.run('run-b', tenantRequest);
  await app.events('run-b', tenantRequest);
  await app.listUsers(tenantRequest);

  const job = calls.find(({ sql }) => sql.includes('FROM scan_jobs'))!;
  const run = calls.find(({ sql }) => sql.includes('FROM scan_runs'))!;
  const events = calls.find(({ sql }) => sql.includes('FROM job_events'))!;
  const users = calls.find(({ sql }) => sql.includes('FROM users'))!;
  for (const call of [job, run, events, users]) {
    assert.match(call.sql, /tenant_id\s*=\s*\$1/);
    assert.equal(call.params[0], 'tenant-b');
  }
  assert.deepEqual(job.params.slice(0, 2), ['tenant-b', 'job-b']);
  assert.deepEqual(run.params.slice(0, 2), ['tenant-b', 'run-b']);
});

test('browser controller fails closed when a route is called without the session-bound principal', async () => {
  const { app } = appWithRecordedQueries();
  await assert.rejects(() => app.job('job-b', { header: () => undefined } as never), /Authenticated request principal required/);
});
