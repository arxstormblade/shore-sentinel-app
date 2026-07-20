import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const webRoot = process.cwd();
const read = (relative) => readFileSync(join(webRoot, relative), 'utf8');

test('managed machine directory controls preserve safe copy and launch boundaries', () => {
  const dashboard = read('app/dashboard/page.jsx');
  const registry = read('components/inventory-registry-client.jsx');
  const component = read('components/machine-detail-client.jsx');
  const css = read('app/globals.css');

  assert.doesNotMatch(dashboard, /Open dossier|open dossier/);
  assert.doesNotMatch(registry, /Open dossier|open dossier/);
  assert.match(dashboard, />Open Machine<\/Link>/);
  assert.match(registry, />Open Machine<\/Link>/);

  assert.match(component, /function validateScanTarget\(value\)/);
  assert.match(component, /[\\u0000-\\u001F\\u007F]/);
  assert.match(component, /target\.length > 1024/);
  assert.ok(component.includes(String.raw`/(^|[\\/])\.\.([\\/]|$)/`));
  assert.match(component, /const \[scanTarget, setScanTarget\] = useState\('\.'\)/);
  assert.match(component, /Directory to scan/);
  assert.match(component, /disabled=\{scanBusy \|\| hasActiveRun\}/);
  assert.match(component, /const targetError = validateScanTarget\(scanTarget\)/);
  assert.match(component, /scan_target: scanTarget\.trim\(\)/);
  assert.match(component, /Directory in scope/);
  assert.match(component, /currentRun\?\.scan_target \|\| '\.'/);

  assert.match(css, /\.machine-scan-controls/);
  assert.match(css, /\.machine-scan-target-label/);
  assert.match(css, /\.machine-scan-target-helper/);
  assert.match(css, /\.machine-progress-meta[\s\S]*?font-variant-numeric: tabular-nums/);
  assert.match(css, /\.machine-scan-controls input[\s\S]*?min-height: 44px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.machine-scan-controls/);
});
