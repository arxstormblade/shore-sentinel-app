import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactService } from '../src/artifact.service.js';

type CleanupSummary = { attempted: number; completed: number; failed: number };
type CleanupService = ArtifactService & {
  reconcileCleanup(runId: string): Promise<CleanupSummary>;
};

function cleanupHarness(outcomes: Array<Error | null>) {
  const calls: string[] = [];
  let workStatus = 'pending';
  let artifactPresent = true;
  let metadataDeletes = 0;
  let deleteCalls = 0;
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('FROM artifact_cleanup_work w') && sql.includes('JOIN scan_runs sr ON sr.id=w.run_id AND sr.tenant_id=w.tenant_id') && sql.includes('WHERE w.run_id=$1') && sql.includes('ORDER BY w.created_at')) {
        return { rows: ['pending', 'failed'].includes(workStatus) ? [{ id: 'cleanup-1', tenant_id: 'tenant-1', artifact_id: 'artifact-1', storage_uri: 's3://shore-sentinel-artifacts/runs/run-1/raw.json' }] : [] };
      }
      if (sql.includes("SET status='processing'")) {
        if (!['pending', 'failed'].includes(workStatus)) return { rows: [] };
        workStatus = 'processing';
        return { rows: [{ id: 'cleanup-1', artifact_id: 'artifact-1', storage_uri: 's3://shore-sentinel-artifacts/runs/run-1/raw.json' }] };
      }
      if (sql.includes("SET status='failed'")) {
        workStatus = 'failed';
        return { rows: [] };
      }
      if (sql.includes('WITH deleted_artifact AS')) {
        if (!artifactPresent || workStatus !== 'processing') return { rows: [] };
        artifactPresent = false;
        metadataDeletes += 1;
        workStatus = 'completed';
        return { rows: [{ id: 'cleanup-1' }] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const service = new ArtifactService(db as never) as CleanupService;
  service.delete = async () => {
    deleteCalls += 1;
    const outcome = outcomes.shift();
    if (outcome) throw outcome;
  };
  return {
    calls,
    service,
    state: () => ({ workStatus, artifactPresent, metadataDeletes, deleteCalls }),
  };
}

test('artifact cleanup exposes an explicit reconciliation entry point for a future admin or worker job', () => {
  const service = new ArtifactService({} as never) as CleanupService;
  assert.equal(typeof service.reconcileCleanup, 'function');
});

test('a failed object deletion leaves the durable cleanup work failed and retains artifact metadata', async () => {
  const harness = cleanupHarness([new Error('MinIO delete unavailable')]);
  const result = await harness.service.reconcileCleanup('run-1');
  assert.deepEqual(result, { attempted: 1, completed: 0, failed: 1 });
  assert.deepEqual(harness.state(), { workStatus: 'failed', artifactPresent: true, metadataDeletes: 0, deleteCalls: 1 });
  assert.ok(harness.calls.some((sql) => sql.includes("SET status='processing'")));
});

test('a retry deletes the object before metadata exactly once after a prior deletion failure', async () => {
  const harness = cleanupHarness([new Error('MinIO delete unavailable'), null]);
  await harness.service.reconcileCleanup('run-1');
  const retry = await harness.service.reconcileCleanup('run-1');
  assert.deepEqual(retry, { attempted: 1, completed: 1, failed: 0 });
  assert.deepEqual(harness.state(), { workStatus: 'completed', artifactPresent: false, metadataDeletes: 1, deleteCalls: 2 });
  const processing = harness.calls.findIndex((sql) => sql.includes("SET status='processing'"));
  const metadata = harness.calls.findIndex((sql) => sql.includes('WITH deleted_artifact AS'));
  assert.ok(processing >= 0 && metadata > processing, 'metadata deletion must follow a claimed cleanup and successful object deletion');
});

test('a missing object is treated as already deleted and completes metadata cleanup', async () => {
  const missing = Object.assign(new Error('missing'), { name: 'NoSuchKey' });
  const harness = cleanupHarness([missing]);
  const result = await harness.service.reconcileCleanup('run-1');
  assert.deepEqual(result, { attempted: 1, completed: 1, failed: 0 });
  assert.deepEqual(harness.state(), { workStatus: 'completed', artifactPresent: false, metadataDeletes: 1, deleteCalls: 1 });
});

test('duplicate cleanup jobs do not delete successful metadata twice', async () => {
  const harness = cleanupHarness([null]);
  const first = await harness.service.reconcileCleanup('run-1');
  const duplicate = await harness.service.reconcileCleanup('run-1');
  assert.deepEqual(first, { attempted: 1, completed: 1, failed: 0 });
  assert.deepEqual(duplicate, { attempted: 0, completed: 0, failed: 0 });
  assert.deepEqual(harness.state(), { workStatus: 'completed', artifactPresent: false, metadataDeletes: 1, deleteCalls: 1 });
});
