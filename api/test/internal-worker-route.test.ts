import test from 'node:test';
import assert from 'node:assert/strict';
import { isInternalWorkerServiceRoute } from '../src/internal-worker-route.js';

test('the authenticated artifact-cleanup reconciliation worker route bypasses session middleware only for its exact POST path', () => {
  assert.equal(isInternalWorkerServiceRoute('POST', '/internal/worker/artifact-cleanup/reconcile'), true);
  assert.equal(isInternalWorkerServiceRoute('GET', '/internal/worker/artifact-cleanup/reconcile'), false);
  assert.equal(isInternalWorkerServiceRoute('POST', '/internal/worker/artifact-cleanup/reconcile/extra'), false);
});
