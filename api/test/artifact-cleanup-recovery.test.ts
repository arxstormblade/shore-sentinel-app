import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';
import { ArtifactService } from '../src/artifact.service.js';

type CleanupSummary = { attempted: number; completed: number; failed: number };
type RecoverableArtifactService = ArtifactService & {
  onModuleInit(): Promise<void>;
  onModuleDestroy(): Promise<void>;
  reconcilePendingCleanup(limit?: number): Promise<CleanupSummary>;
};

test('a committed cancellation remains terminal when artifact cleanup enqueue fails', async () => {
  const operationOrder: string[] = [];
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string) => {
      if (sql.includes('artifact_cleanup_work')) operationOrder.push('cleanup-persisted');
      if (sql.includes('final_state AS')) return { rows: [{ status: 'cancelled' }] };
      return { rows: [] };
    },
  };
  const auth = { me: async () => ({ id: 'operator-1', roles: ['operator'] }) };
  const queue = { enqueue: async () => {
    operationOrder.push('cleanup-dispatch');
    throw new Error('redis unavailable: internal topology');
  } };
  const app = new AppController(db as never, auth as never, queue as never, {} as never, {} as never);

  const result = await app.cancelRun('run-1', { reason: 'operator request' }, {
    principal: { userId: 'operator-1', tenantId: 'tenant-1', roles: ['operator'] }, header: () => undefined,
  } as never);

  assert.deepEqual(result, { id: 'run-1', status: 'cancelled' });
  assert.deepEqual(operationOrder, ['cleanup-persisted', 'cleanup-dispatch']);
  assert.equal(JSON.stringify(result).includes('redis unavailable'), false);
});

function recoveryHarness() {
  const work = [
    { id: 'cleanup-pending', tenant_id: 'tenant-a', artifact_id: 'artifact-pending', storage_uri: 's3://shore-sentinel-artifacts/runs/run-pending/raw.json', status: 'pending', metadataPresent: true },
    { id: 'cleanup-failed', tenant_id: 'tenant-b', artifact_id: 'artifact-failed', storage_uri: 's3://shore-sentinel-artifacts/runs/run-failed/raw.json', status: 'failed', metadataPresent: true },
  ];
  const calls: string[] = [];
  const deleted: string[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push(sql);
      if (sql.includes('FROM artifact_cleanup_work') && sql.includes('tenant_id') && sql.includes('LIMIT $1')) {
        const limit = Number(params[0]);
        return { rows: work.filter((item) => item.status === 'pending' || item.status === 'failed').slice(0, limit) };
      }
      if (sql.includes("SET status='processing'")) {
        const item = work.find((candidate) => candidate.tenant_id === params[0] && candidate.id === params[1]);
        if (!item || !['pending', 'failed'].includes(item.status)) return { rows: [] };
        item.status = 'processing';
        return { rows: [item] };
      }
      if (sql.includes('WITH deleted_artifact AS')) {
        const item = work.find((candidate) => candidate.tenant_id === params[0] && candidate.id === params[1]);
        if (!item || item.status !== 'processing' || !item.metadataPresent) return { rows: [] };
        item.metadataPresent = false;
        item.status = 'completed';
        return { rows: [{ id: item.id }] };
      }
      if (sql.includes("SET status='failed'")) {
        const item = work.find((candidate) => candidate.tenant_id === params[0] && candidate.id === params[1]);
        if (item) item.status = 'failed';
        return { rows: [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const service = new ArtifactService(db as never) as RecoverableArtifactService;
  service.delete = async (uri: string) => { deleted.push(uri); };
  return { calls, deleted, service, work };
}

test('API startup recovery finds queue-independent pending cleanup work in bounded batches', async () => {
  const harness = recoveryHarness();
  await harness.service.onModuleInit();
  await new Promise((resolve) => setImmediate(resolve));
  await harness.service.onModuleDestroy();

  assert.deepEqual(harness.deleted, ['s3://shore-sentinel-artifacts/runs/run-pending/raw.json', 's3://shore-sentinel-artifacts/runs/run-failed/raw.json']);
  assert.equal(harness.work.every((item) => item.status === 'completed' && !item.metadataPresent), true);
  const recoverySelect = harness.calls.find((sql) => sql.includes('FROM artifact_cleanup_work') && sql.includes('tenant_id') && sql.includes('LIMIT $1'));
  assert.ok(recoverySelect, 'startup recovery must query durable cleanup rows directly, without a queue job');
  assert.match(recoverySelect, /LIMIT \$1/);
});

test('bounded recovery claims one durable work item and duplicate/timer recovery cannot delete it twice', async () => {
  const harness = recoveryHarness();
  const [first, duplicate] = await Promise.all([
    harness.service.reconcilePendingCleanup(1),
    harness.service.reconcilePendingCleanup(1),
  ]);

  assert.deepEqual(first, { attempted: 1, completed: 1, failed: 0 });
  assert.deepEqual(duplicate, { attempted: 0, completed: 0, failed: 0 });
  assert.deepEqual(harness.deleted, ['s3://shore-sentinel-artifacts/runs/run-pending/raw.json']);
  assert.equal(harness.work[0].metadataPresent, false, 'metadata is removed only after the object delete succeeds');
  assert.equal(harness.work[1].metadataPresent, true, 'the bounded batch retains later work for a future recovery pass');
});
