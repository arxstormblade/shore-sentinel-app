import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

const token = 'cleanup-worker-token';
process.env.INTERNAL_WORKER_TOKEN = token;

function cleanupRouteHarness() {
  const calls: Array<{ runId: string }> = [];
  const app = new AppController(
    {} as never,
    {} as never,
    {} as never,
    { reconcileCleanup: async (runId: string) => {
      calls.push({ runId });
      return { attempted: 1, completed: 0, failed: 1 };
    } } as never,
    {} as never,
  );
  const request = (authorization: string) => ({ header: (name: string) => name === 'authorization' ? authorization : undefined }) as never;
  return { app: app as any, calls, request };
}

test('internal cleanup route accepts only the worker token, invokes bounded reconciliation, and omits cleanup identifiers from its response', async () => {
  const { app, calls, request } = cleanupRouteHarness();
  const result = await app.reconcileArtifactCleanup({ runId: 'run-1' }, request(`Bearer ${token}`));
  assert.deepEqual(calls, [{ runId: 'run-1' }]);
  assert.deepEqual(result, { accepted: true, attempted: 1, completed: 0, failed: 1 });
  assert.equal(JSON.stringify(result).includes('tenant-1'), false);
  assert.equal(JSON.stringify(result).includes('run-1'), false);

  await assert.rejects(
    () => app.reconcileArtifactCleanup({ runId: 'run-1' }, request('Bearer invalid-token')),
    /Internal worker authentication failed/,
  );
  assert.deepEqual(calls, [{ runId: 'run-1' }]);
});
