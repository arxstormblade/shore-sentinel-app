import test from 'node:test';
import assert from 'node:assert/strict';
import { validateScanTarget } from '../src/validation.js';
import { AppController } from '../src/app.controller.js';

const viewerRequest = { principal: { userId: 'viewer-1', tenantId: 'tenant-1', roles: ['viewer'] }, header: () => undefined } as never;

test('scan target validation accepts only default or absolute POSIX directories', () => {
  assert.equal(validateScanTarget(), '.');
  assert.equal(validateScanTarget('   '), '.');
  assert.equal(validateScanTarget('.'), '.');
  assert.equal(validateScanTarget('/srv/app'), '/srv/app');
});

test('scan target validation rejects unsafe or non-directory targets', () => {
  assert.throws(() => validateScanTarget('../etc'), /relative traversal/);
  assert.throws(() => validateScanTarget('/srv/../etc'), /relative traversal/);
  assert.throws(() => validateScanTarget('reports'), /absolute POSIX directory/);
  assert.throws(() => validateScanTarget('/srv/\u0000bad'), /invalid/);
  assert.throws(() => validateScanTarget('/srv/\nbad'), /invalid/);
  assert.throws(() => validateScanTarget('x'.repeat(1025)), /too long/);
});

test('target scan run lists project scan target without runtime context', async () => {
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string) => {
      if (sql.includes('FROM scan_runs r') && sql.includes('r.runtime_context')) {
        return {
          rows: [{
            id: 'run-1', job_id: 'job-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null,
            status: 'completed', exit_code: 0, started_at: null, completed_at: null, duration_seconds: null,
            created_at: null, updated_at: null, runtime_context: { scan_target: '/srv/app', credential: 'secret' },
            latest_event_type: 'job.succeeded', latest_event_message: 'done', latest_progress_percent: 100, latest_event_at: null, artifacts: [],
          }],
        };
      }
      return { rows: [] };
    },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never);
  const result = await app.targetScanRuns('target-1', viewerRequest);
  assert.equal(result.runs[0].scan_target, '/srv/app');
  assert.equal('runtime_context' in result.runs[0], false);
  assert.equal('credential' in result.runs[0], false);
});


test('public scan run projection exposes only safe metadata and scan target', async () => {
  const db = {
    query: async (sql: string) => {
      if (sql.includes('FROM scan_runs WHERE tenant_id=$1 AND id=$2') && sql.includes('runtime_context')) {
        return {
          rows: [{
            id: 'run-1', job_id: 'job-1', subject_type: 'managed_target', target_id: 'target-1', one_time_audit_id: null,
            status: 'completed', exit_code: 0, started_at: '2026-07-16T00:00:00.000Z', completed_at: '2026-07-16T00:01:00.000Z',
            duration_seconds: 60, created_at: '2026-07-16T00:00:00.000Z', updated_at: '2026-07-16T00:01:00.000Z',
            runtime_context: {
              scan_target: '/srv/app', credential: 'secret', connection_secret: 'private-key',
              worker_metadata: { host: 'internal' }, artifact_storage_uri: 's3://private', scanner_raw_output: 'raw',
            },
          }],
        };
      }
      return { rows: [] };
    },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never);
  const result = await app.run('run-1', viewerRequest);
  assert.deepEqual(Object.keys(result).sort(), [
    'completed_at', 'created_at', 'duration_seconds', 'exit_code', 'id', 'job_id', 'one_time_audit_id', 'scan_target',
    'started_at', 'status', 'subject_type', 'target_id', 'updated_at',
  ]);
  assert.equal(result.scan_target, '/srv/app');
  for (const key of ['runtime_context', 'credential', 'connection_secret', 'worker_metadata', 'artifact_storage_uri', 'scanner_raw_output']) {
    assert.equal(key in result, false);
  }
});
