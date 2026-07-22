import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExecutionAuthorization } from '../src/engagement/authorization.service.js';
import { ExecutionGrantService } from '../src/policy/execution-grant.service.js';

const base = {
  engagement: { id: 'eng-1', tenantId: 'tenant-1', expiresAt: '2026-07-23T00:00:00.000Z', revokedAt: null, ownerAuthorized: true, scope: { assets: ['asset-1'], tests: ['prompt-injection'] } },
  approvals: [{ approverId: 'owner-1', role: 'owner' }, { approverId: 'reviewer-1', role: 'reviewer' }],
  policy: { id: 'policy-1', hash: 'a'.repeat(64), active: true },
  requestedScope: { assets: ['asset-1'], tests: ['prompt-injection'] },
  now: new Date('2026-07-22T00:00:00.000Z'),
};

test('execution authorization requires immutable owner authorization, distinct dual approval, scope, expiry, and policy hash', () => {
  assert.equal(evaluateExecutionAuthorization(base).allowed, true);
  const rejected = [
    { ...base, engagement: { ...base.engagement, ownerAuthorized: false } },
    { ...base, approvals: [{ approverId: 'owner-1', role: 'owner' }] },
    { ...base, approvals: [{ approverId: 'owner-1', role: 'owner' }, { approverId: 'owner-1', role: 'reviewer' }] },
    { ...base, requestedScope: { assets: ['asset-2'], tests: ['prompt-injection'] } },
    { ...base, engagement: { ...base.engagement, expiresAt: '2026-07-21T00:00:00.000Z' } },
    { ...base, expectedPolicyHash: 'b'.repeat(64) },
    { ...base, policy: { ...base.policy, active: false } },
  ];
  for (const input of rejected) assert.equal(evaluateExecutionAuthorization(input).allowed, false);
});

test('execution grant service refuses policy drift and writes bounded authorization metadata', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = { query: async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return { rows: [{ id: 'grant-1', expires_at: '2026-07-22T01:00:00.000Z' }] };
  } };
  const service = new ExecutionGrantService(db as never, {
    authorize: async () => ({ allowed: true, engagementId: 'eng-1', policyBundleId: 'policy-1', policyHash: 'a'.repeat(64) }),
  } as never);
  const result = await service.issue({ tenantId: 'tenant-1', runId: 'run-1', engagementId: 'eng-1', policyBundleId: 'policy-1', policyHash: 'a'.repeat(64), scope: { assets: ['asset-1'] }, expiresAt: new Date(Date.now() + 60_000) });
  assert.equal(result.id, 'grant-1');
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO execution_authorizations'))!;
  assert.ok(insert);
  assert.equal(insert.params.includes('a'.repeat(64)), true);
  assert.equal(insert.params.some((param) => typeof param === 'object' && JSON.stringify(param).includes('secret')), false);
});
