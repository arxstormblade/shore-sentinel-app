import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const runnerPath = new URL('../src/scannerRunner.js', import.meta.url);

function validRaw(overrides = {}) {
  const metadata = {
    generated_utc: '2026-07-22T00:00:00Z',
    script_sha256: 'a'.repeat(64),
    script_version: '3.5.1',
    target_asset_id: 'asset-v35',
    coverage: { scan_complete: true },
  };
  const base = {
    contractVersion: 'shore-sentinel.scanner-output/v1',
    scanner: { name: 'Agent Security Selfcheck', version: '3.5.1', scriptSha256: 'a'.repeat(64) },
    target: { assetId: 'asset-v35', hostname: 'unknown' },
    coverage: { scan_complete: true },
    decision: { status: 'PASS', exit_code: 0 },
    collectedAt: metadata.generated_utc,
    metadata,
    score: { overall_score: 100, grade: 'Low Risk', categories: {} },
    executive_summary: ['summary'],
    findings: [{
      id: 'finding-1', title: 'Finding', severity: 'high', severityScore: 3,
      category: 'security', description: 'detail', evidence: [{ text: 'evidence', kind: 'observation', scope: 'target_source', confidence: 'high' }],
      remediation: null, references: [], status: 'WARN', risk: 'High', check: 'check',
      scope: 'target_source', confidence: 'high', reachability: 'declared', evidenceKind: 'observation', derived: false, derivedFrom: [], source: null,
    }],
  };
  return { ...base, ...overrides };
}

test('managed scanner runner uses the v3.5 bundle entrypoint and preserves canonical IDs', async () => {
  const source = await readFile(runnerPath, 'utf8');
  assert.match(source, /Agent_Security_Selfcheck_v3\.5\.1\.py/);
  assert.doesNotMatch(source, /Agent_Security_Selfcheck_v3\.4\.0\.py/);
  assert.doesNotMatch(source, /`finding-\$\{index \+ 1\}`/);
});

test('managed scanner runner rejects report paths outside its output directory', async () => {
  const { resolveContainedPath } = await import(`../src/scannerRunner.js?path=${Date.now()}`);
  const outDir = await mkdtemp(join(tmpdir(), 'shore-v35-path-test-'));
  const outside = await mkdtemp(join(tmpdir(), 'shore-v35-path-outside-'));
  try {
    await writeFile(join(outDir, 'report.json'), '{}');
    await writeFile(join(outside, 'secret.json'), '{}');
    await symlink(join(outside, 'secret.json'), join(outDir, 'escape.json'));
    await assert.rejects(() => resolveContainedPath(outDir, join(outDir, 'escape.json')), /escapes output directory/);
    await assert.rejects(() => resolveContainedPath(outDir, join(outside, 'secret.json')), /escapes output directory/);
    assert.equal(await resolveContainedPath(outDir, 'report.json'), join(outDir, 'report.json'));
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('managed scanner runner executes v3.5 and hands off contract-complete artifacts', async () => {
  const scanner = new URL('../../../scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.1.py', import.meta.url);
  const target = await mkdtemp(join(tmpdir(), 'shore-v35-node-target-'));
  process.env.SCANNER_SCRIPT = scanner.pathname;
  process.env.SCANNER_TARGET = target;
  try {
    const { runBundledScanner } = await import(`../src/scannerRunner.js?integration=${Date.now()}`);
    const result = await runBundledScanner({ runId: 'node-v35-contract', targetId: 'asset-v35' });
    assert.equal(result.scannerOutput.coverage.scan_complete, true);
    assert.equal(result.scannerOutput.decision.exit_code, 0);
    assert.equal(result.scannerOutput.target.assetId, 'asset-v35');
    assert.ok(result.scannerOutput.findings.every((finding) => finding.id && finding.scope && finding.confidence && finding.reachability && finding.evidenceKind));
    assert.ok(result.artifacts.some((artifact) => artifact.kind === 'scanner.raw_output'));
    assert.ok(result.artifacts.some((artifact) => artifact.kind === 'sarif'));
  } finally {
    delete process.env.SCANNER_SCRIPT;
    delete process.env.SCANNER_TARGET;
    await rm(target, { recursive: true, force: true });
  }
});

test('Node rejects non-RFC3339 timestamps, negative exits, and invalid provenance', async () => {
  const { toContract } = await import(`../src/scannerRunner.js?validation=${Date.now()}`);
  assert.throws(() => toContract(validRaw({ collectedAt: '2026-07-22 00:00:00+00:00' }), { targetId: 'asset-v35' }), /RFC3339/);
  assert.throws(() => toContract(validRaw({ decision: { status: 'ERROR', exit_code: -1 } }), { targetId: 'asset-v35' }), /decision/);
  assert.throws(() => toContract(validRaw({ findings: [{ ...validRaw().findings[0], scope: 'invalid' }] }), { targetId: 'asset-v35' }), /scope/);
});

test('Node rejects producer target identity and evidence type mismatches', async () => {
  const { toContract } = await import(`../src/scannerRunner.js?identity=${Date.now()}`);
  assert.throws(() => toContract(validRaw({ target: { assetId: 'other-asset' } }), { targetId: 'asset-v35' }), /identity mismatch/);
  assert.throws(() => toContract(validRaw({ target: { assetId: 'asset-v35', subjectType: 'producer-type' } }), { targetId: 'asset-v35', subjectType: 'runner-type' }), /subject type mismatch/);
  assert.throws(() => toContract(validRaw({ coverage: { scan_complete: true, scope_mode: 'invalid' } }), { targetId: 'asset-v35' }), /scope_mode/);
  assert.throws(() => toContract(validRaw({ metadata: { ...validRaw().metadata, target_asset_id: 'other-asset' } }), { targetId: 'asset-v35' }), /metadata target provenance mismatch/);
  assert.throws(() => toContract(validRaw({ findings: [{ ...validRaw().findings[0], evidence: ['raw scalar'] }] }), { targetId: 'asset-v35' }), /evidence/);
});
