import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('existing worker process consumes isolated artifact cleanup jobs and throws failed reconciliation for BullMQ retry', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const apiQueueSource = await readFile(new URL('../../../api/src/queue.service.ts', import.meta.url), 'utf8');
  assert.match(source, /new Worker\(QUEUES\.artifactProcessing/);
  assert.match(source, /processArtifactCleanupJob/);
  assert.match(source, /api\.reconcileArtifactCleanup\(\{ tenantId, runId \}\)/);
  assert.match(source, /result\.failed > 0/);
  assert.match(apiQueueSource, /queueName === 'artifact_processing'[\s\S]*attempts: 3, backoff: \{ type: 'exponential', delay: 1000 \}/);
});
