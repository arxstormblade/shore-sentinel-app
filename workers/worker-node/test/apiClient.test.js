import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/apiClient.js';

test('API client sends a per-run SSH grant capability only on event and artifact requests', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({}) };
  };
  try {
    const api = createApiClient('http://api.test', 'worker-service-token');
    await api.fetchSshGrant('run-1', 'target-1');
    await api.emitRunEvent({ runId: 'run-1', type: 'job.running' }, 'opaque-worker-capability');
    await api.uploadArtifact({ runId: 'run-1', kind: 'scanner_raw_output' }, 'opaque-worker-capability');

    assert.equal(requests[0].options.headers['x-worker-capability'], undefined);
    assert.equal(requests[1].options.headers['x-worker-capability'], 'opaque-worker-capability');
    assert.equal(requests[2].options.headers['x-worker-capability'], 'opaque-worker-capability');
    assert.equal(requests[1].options.headers.authorization, 'Bearer worker-service-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('artifact cleanup reconciliation uses only internal worker authentication and opaque identifiers', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ accepted: true, attempted: 1, completed: 1, failed: 0 }) };
  };
  try {
    const api = createApiClient('http://api.test', 'worker-service-token');
    await api.reconcileArtifactCleanup({ tenantId: 'tenant-1', runId: 'run-1' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://api.test/internal/worker/artifact-cleanup/reconcile');
    assert.deepEqual(JSON.parse(requests[0].options.body), { tenantId: 'tenant-1', runId: 'run-1' });
    assert.deepEqual(requests[0].options.headers, { 'content-type': 'application/json', authorization: 'Bearer worker-service-token' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
