import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

const request = { principal: { userId: '00000000-0000-4000-8000-000000000001', tenantId: '00000000-0000-4000-8000-000000000002', roles: ['admin'] }, header: () => undefined } as never;
const engagementId = '00000000-0000-4000-8000-000000000003';
const policyBundleId = '00000000-0000-4000-8000-000000000004';

test('policy simulation records null foreign keys for valid but nonexistent tenant-scoped IDs', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let authorizationCalls = 0;
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM engagements WHERE tenant_id=$1 AND id=$2')) return { rows: [] };
      if (sql.includes('FROM policy_bundles WHERE tenant_id=$1 AND id=$2')) return { rows: [] };
      return { rows: [] };
    },
  };
  const authorization = {
    simulate: async () => {
      authorizationCalls += 1;
      return { allowed: false, reason: 'authorization records unavailable' };
    },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never, authorization as never);

  const result = await app.simulatePolicy({ engagement_id: engagementId, policy_bundle_id: policyBundleId }, request);

  assert.deepEqual(result, { allowed: false, reason: 'authorization records unavailable' });
  assert.equal(authorizationCalls, 1);
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO policy_simulations'));
  assert.ok(insert);
  assert.equal(insert.params[1], null);
  assert.equal(insert.params[2], null);
});

test('policy simulation rejects malformed IDs before authorization database queries', async () => {
  let authorizationCalls = 0;
  const db = { query: async () => { throw new Error('database query must not run'); } };
  const authorization = { simulate: async () => { authorizationCalls += 1; return { allowed: false }; } };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never, authorization as never);

  await assert.rejects(() => app.simulatePolicy({ engagement_id: 'not-a-uuid', policy_bundle_id: policyBundleId }, request), /engagement_id must be a valid UUID/);
  assert.equal(authorizationCalls, 0);
});
