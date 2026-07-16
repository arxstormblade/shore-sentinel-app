import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const status = await import(pathToFileURL(join(root, 'lib/machine-run-status.js')).href);

assert.equal(status.isTerminalRun({ status: 'completed' }), true);
assert.equal(status.isTerminalRun({ status: 'failed' }), true);
assert.equal(status.isTerminalRun({ status: 'cancelled' }), true);
assert.equal(status.isTerminalRun({ status: 'stale' }), true, 'stale runs must stop polling and re-enable scanning');
assert.equal(status.isTerminalRun({ status: 'running' }), false);

assert.equal(status.isSuccessfulRun({ status: 'completed' }), true);
assert.equal(status.isSuccessfulRun({ status: 'succeeded' }), true);
assert.equal(status.isSuccessfulRun({ status: 'failed' }), false);
assert.equal(status.isSuccessfulRun({ status: 'cancelled' }), false);
assert.equal(status.isSuccessfulRun({ status: 'stale' }), false);

assert.equal(status.progressForRun({ status: 'completed' }), 100);
assert.equal(status.progressForRun({ status: 'failed', progress_percent: 42 }), 42);
assert.equal(status.progressForRun({ status: 'cancelled' }), 0);
assert.equal(status.progressForRun({ status: 'stale', latest_progress_percent: 150 }), 100, 'progress must clamp to ARIA bounds');
assert.equal(status.progressForRun({ status: 'running', progress_percent: -20 }), 0, 'progress must clamp to ARIA bounds');

assert.equal(status.toneForRun({ status: 'completed' }), 'green');
assert.equal(status.toneForRun({ status: 'failed' }), 'red');
assert.equal(status.toneForRun({ status: 'cancelled' }), 'amber');
assert.equal(status.toneForRun({ status: 'stale' }), 'amber');
assert.equal(status.toneForRun({ status: 'running' }), 'amber');

console.log('Managed machine run-state verification passed.');
