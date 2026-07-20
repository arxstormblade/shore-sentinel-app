import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactService } from '../src/artifact.service.js';

test('worker cleanup accepts only a run id and derives the tenant from persisted run-owned cleanup work', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const service = new ArtifactService({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM artifact_cleanup_work')) return { rows: [] };
      return { rows: [] };
    },
  } as never);

  const result = await service.reconcileCleanup('run-a');
  assert.deepEqual(result, { attempted: 0, completed: 0, failed: 0 });
  const selection = calls[0];
  assert.match(selection.sql, /JOIN scan_runs sr ON sr\.id=w\.run_id AND sr\.tenant_id=w\.tenant_id/);
  assert.match(selection.sql, /w\.run_id=\$1/);
  assert.deepEqual(selection.params, ['run-a']);
});
