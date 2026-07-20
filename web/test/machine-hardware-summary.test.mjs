import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const webRoot = process.cwd();
const read = (relative) => readFileSync(join(webRoot, relative), 'utf8');

test('machine detail renders an accessible browser-safe hardware summary below identity', () => {
  const page = read('app/inventory/machines/[id]/page.jsx');
  const component = read('components/machine-detail-client.jsx');

  assert.match(page, /hardware_summary: live\.hardware_summary \?\? null/);
  assert.match(component, /function hardwareSummaryState\(summary\)/);
  assert.match(component, /function hardwareSummaryIsStale\(summary\)/);
  assert.match(component, /className="machine-hardware-summary"/);
  assert.match(component, /aria-label="Hardware summary"/);
  assert.match(component, /Hardware summary unavailable/);
  assert.match(component, /Hardware details may be stale/);
  assert.match(component, /Agent version/);
  assert.match(component, /Last contact/);
  assert.match(component, /SSH port/);
  assert.ok(component.indexOf('className="machine-hardware-summary"') > component.indexOf('<h1>{machine.name}</h1>'));
  assert.ok(component.indexOf('className="machine-hardware-summary"') < component.indexOf('<p>{machine.summary}</p>'));
  assert.doesNotMatch(component, /dangerouslySetInnerHTML|innerHTML/);
  for (const internalField of ['runtime_context', 'scanner_raw_output', 'sealed_secret', 'storage_uri', 'host_key_fingerprint', 'permitted_cidr']) {
    assert.doesNotMatch(component, new RegExp(internalField));
  }
});
