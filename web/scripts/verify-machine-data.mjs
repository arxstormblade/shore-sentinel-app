import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const data = await import(pathToFileURL(join(root, 'lib/machine-detail-data.js')).href);

const fallbackReports = [{ id: 'report-1', status: 'completed' }];
assert.deepEqual(data.selectInitialRuns(null, fallbackReports), fallbackReports, 'failed run-history request must preserve fallback history');
assert.deepEqual(data.selectInitialRuns(undefined, fallbackReports), fallbackReports);
assert.deepEqual(data.selectInitialRuns({ runs: [] }, fallbackReports), [], 'successful empty history must stay empty');

const remediations = [
  { id: 'open-1', status: 'open' },
  { id: 'accepted-1', status: 'accepted' },
  { id: 'fixed-1', status: 'fixed' },
  { id: 'resolved-1', status: 'resolved' },
];
assert.deepEqual(data.openRemediationItems(remediations).map((item) => item.id), ['open-1', 'accepted-1']);
assert.equal(data.openRemediationCount(0, remediations), 0, 'a valid server count of zero must remain zero');
assert.equal(data.openRemediationCount(null, remediations), 2, 'missing count may derive from filtered open items');
assert.equal(data.scanLaunchBlocked([], true), true, 'unavailable run history must fail closed');
assert.equal(data.scanLaunchBlocked([{ status: 'stale' }], false), false, 'stale runs are terminal');
assert.equal(data.scanLaunchBlocked([{ status: 'running' }], false), true, 'active runs block duplicate scans');

console.log('Managed machine data-state verification passed.');
