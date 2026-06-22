import test from 'node:test';
import assert from 'node:assert/strict';
import { scannerBundleContractVersion } from '@shore-sentinel/shared';
import { normalizeJobData } from '../src/payload.js';

test('normalizes API snake_case scan payload to worker camelCase contract', () => {
  const payload = normalizeJobData({
    id: 'job-1',
    run_id: 'run-1',
    subject_type: 'managed_target',
    target_id: 'target-1',
  });
  assert.equal(payload.jobId, 'job-1');
  assert.equal(payload.runId, 'run-1');
  assert.equal(payload.subjectType, 'managed_target');
  assert.equal(payload.targetId, 'target-1');
  assert.equal(payload.scannerOutput.contractVersion, scannerBundleContractVersion());
  assert.deepEqual(payload.scannerOutput.findings, []);
});

test('preserves scannerOutput when API provides canonical worker payload', () => {
  const scannerOutput = { contractVersion: scannerBundleContractVersion(), findings: [{ id: 'finding-1' }] };
  const payload = normalizeJobData({ jobId: 'job-1', runId: 'run-1', scannerOutput });
  assert.equal(payload.scannerOutput, scannerOutput);
});

test('rejects scan payloads without run id', () => {
  assert.throws(() => normalizeJobData({ id: 'job-1' }), /runId\/run_id/);
});
