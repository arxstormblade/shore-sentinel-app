import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const component = readFileSync(join(process.cwd(), 'components/machine-detail-client.jsx'), 'utf8');
const runStatus = readFileSync(join(process.cwd(), 'lib/machine-run-status.js'), 'utf8');
const cancelScan = component.slice(component.indexOf('async function cancelScan'), component.indexOf('function updateField'));

test('machine detail confirms an authorized cancellation with canonical run and event DTOs', () => {
  assert.match(component, /const \[cancelBusy, setCancelBusy\] = useState\(false\)/);
  assert.match(cancelScan, /if \(!permissions\.edit \|\| !activeRun\?\.id\)/);
  assert.match(cancelScan, /fetch\(appPath\(`\/api\/scan-runs\/\$\{activeRun\.id\}\/cancel`\), \{/);
  assert.match(cancelScan, /method: 'POST'/);
  assert.match(cancelScan, /credentials: 'same-origin'/);
  assert.match(cancelScan, /const cancellation = await response\.json\(\)/);
  assert.match(cancelScan, /cancellation\?\.id !== activeRun\.id \|\| cancellation\?\.status !== 'cancelled'/);
  assert.match(cancelScan, /fetch\(appPath\(`\/api\/scan-runs\/\$\{activeRun\.id\}`\), requestOptions\)/);
  assert.match(cancelScan, /fetch\(appPath\(`\/api\/scan-runs\/\$\{activeRun\.id\}\/events`\), requestOptions\)/);
  assert.match(cancelScan, /event\?\.event_type === 'scan\.cancelled'/);
  assert.match(runStatus, /'scan\.cancelled'/);
  assert.match(cancelScan, /setRuns\(\(current\) => \{[\s\S]*?\.\.\.confirmedRun,[\s\S]*?events: ensureArray\(eventsPayload\.events\)/);
  assert.match(cancelScan, /setActiveRunId\(null\)/);
  assert.match(cancelScan, /setNotice\('Scan cancellation confirmed\.'\)/);
  assert.match(cancelScan, /setNotice\('Unable to stop scan\. Please try again\.'\)/);
  assert.doesNotMatch(cancelScan, /job\.cancelled|marked cancelled locally|error\.message|error\.stack/);
  assert.match(component, /\{hasActiveRun && permissions\.edit \? \(/);
  assert.match(component, /aria-label="Stop active scan"/);
  assert.match(component, /disabled=\{cancelBusy\}/);
  assert.match(component, /cancelBusy \? 'Stopping scan…' : 'Stop Scan'/);
  assert.match(component, /role="status" aria-live="polite"/);
  assert.match(component, /const scanBlocked = !permissions\.scan \|\| scanLaunchBlocked\(runs, runHistoryUnavailable\)/);
});
