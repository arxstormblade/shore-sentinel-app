import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { scannerBundleContractVersion } from '@shore-sentinel/shared';

const execFileAsync = promisify(execFile);

const scannerPath = process.env.SCANNER_SCRIPT || '/app/scanner-bundle/bin/Agent_Security_Selfcheck_v3.5.1.py';
const scannerTarget = process.env.SCANNER_TARGET || '/app';
const VALID_CONFIDENCE = new Set(['confirmed', 'high', 'medium', 'low']);
const VALID_SCOPE = new Set(['target_source', 'host_runtime', 'external/unknown']);
const VALID_REACHABILITY = new Set(['unknown', 'declared', 'host_only', 'host_observed']);
const VALID_EVIDENCE_KIND = new Set(['observation', 'secret_classification', 'compose_socket_mount', 'correlation', 'coverage_diagnostic']);
const VALID_STATUS = new Set(['PASS', 'WARN', 'FAIL', 'SKIP']);
const VALID_RISK = new Set(['Critical', 'High', 'Medium', 'Low', 'Info']);
const VALID_SEVERITY = new Set(['informational', 'low', 'moderate', 'high', 'critical']);
const VALID_DECISION_STATUS = new Set(['PASS', 'ERROR', 'FAIL']);
const VALID_SCOPE_MODE = new Set(['exact', 'discover', 'runtime', 'full']);
const RFC3339 = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
const COVERAGE_BOOLEAN_FIELDS = new Set([
  'scan_complete', 'security_relevant_incomplete', 'truncated_file_list', 'host_runtime_not_collected', 'host_runtime_incomplete',
]);
const COVERAGE_INTEGER_FIELDS = new Set(['files_discovered']);
const COVERAGE_STRING_FIELDS = new Set(['requested_root', 'effective_root', 'scope_mode', 'host_runtime_error']);
const COVERAGE_STRING_ARRAY_FIELDS = new Set(['secret_files_not_read', 'missing_optional_paths', 'symlink_directory_skips', 'symlink_skips', 'decode_errors']);
const COVERAGE_RECORD_ARRAY_FIELDS = new Set(['walk_errors', 'unreadable_paths', 'truncated_files', 'limit_overrides', 'config_parse_errors', 'scope_errors', 'runtime_probe_errors']);
const COVERAGE_FIELDS = new Set([
  ...COVERAGE_BOOLEAN_FIELDS, ...COVERAGE_INTEGER_FIELDS, ...COVERAGE_STRING_FIELDS,
  ...COVERAGE_STRING_ARRAY_FIELDS, ...COVERAGE_RECORD_ARRAY_FIELDS,
]);

function isDateTime(value) {
  const match = typeof value === 'string' && value.match(RFC3339);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertString(value, label, { nonEmpty = true } = {}) {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) throw new Error(`${label} must be a string`);
}

function validateCoverage(coverage) {
  if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) throw new Error('scanner output missing coverage contract');
  for (const key of Object.keys(coverage)) {
    if (!COVERAGE_FIELDS.has(key)) throw new Error(`scanner coverage has unknown field: ${key}`);
  }
  for (const key of COVERAGE_BOOLEAN_FIELDS) {
    if (key in coverage && typeof coverage[key] !== 'boolean') throw new Error(`scanner coverage field ${key} must be boolean`);
  }
  for (const key of COVERAGE_INTEGER_FIELDS) {
    if (key in coverage && (!Number.isInteger(coverage[key]) || coverage[key] < 0)) throw new Error(`scanner coverage field ${key} must be a nonnegative integer`);
  }
  for (const key of COVERAGE_STRING_FIELDS) {
    if (key in coverage) assertString(coverage[key], `scanner coverage field ${key}`);
  }
  if ('scope_mode' in coverage && !VALID_SCOPE_MODE.has(coverage.scope_mode)) throw new Error('scanner coverage scope_mode is invalid');
  for (const key of COVERAGE_STRING_ARRAY_FIELDS) {
    if (key in coverage && (!Array.isArray(coverage[key]) || coverage[key].some((item) => typeof item !== 'string'))) throw new Error(`scanner coverage field ${key} must be a string array`);
  }
  for (const key of COVERAGE_RECORD_ARRAY_FIELDS) {
    if (key in coverage && (!Array.isArray(coverage[key]) || coverage[key].some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) throw new Error(`scanner coverage field ${key} must be an object array`);
  }
  if (typeof coverage.scan_complete !== 'boolean') throw new Error('scanner coverage missing scan_complete');
}

function severityFromRisk(risk) {
  if (!VALID_RISK.has(risk)) throw new Error('scanner finding has invalid risk');
  return { Critical: 'critical', High: 'high', Medium: 'moderate', Low: 'low', Info: 'informational' }[risk];
}

function validateEvidence(evidence, index) {
  if (!Array.isArray(evidence)) throw new Error(`scanner finding ${index} evidence must be an array`);
  for (const item of evidence) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`scanner finding ${index} evidence item must be an object`);
    assertString(item.text, `scanner finding ${index} evidence text`);
    if (!VALID_EVIDENCE_KIND.has(item.kind)) throw new Error(`scanner finding ${index} evidence kind is invalid`);
    if (!VALID_SCOPE.has(item.scope)) throw new Error(`scanner finding ${index} evidence scope is invalid`);
    if (!VALID_CONFIDENCE.has(item.confidence)) throw new Error(`scanner finding ${index} evidence confidence is invalid`);
    if ('path' in item) assertString(item.path, `scanner finding ${index} evidence path`);
    if ('line' in item && (!Number.isInteger(item.line) || item.line < 1)) throw new Error(`scanner finding ${index} evidence line is invalid`);
  }
}

export function toContract(raw, data) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('scanner output must be an object');
  if (raw.contractVersion !== scannerBundleContractVersion()) throw new Error(`scanner contract version mismatch: ${raw.contractVersion || 'missing'}`);
  validateCoverage(raw.coverage);
  if (!raw.decision || typeof raw.decision !== 'object' || Array.isArray(raw.decision) || !Number.isInteger(raw.decision.exit_code) || raw.decision.exit_code < 0 || !VALID_DECISION_STATUS.has(raw.decision.status)) throw new Error('scanner output missing decision contract');
  if (!raw.coverage.scan_complete || raw.coverage.security_relevant_incomplete || raw.decision.exit_code !== 0 || raw.decision.status !== 'PASS') throw new Error('scanner output has incomplete or non-clean decision state');
  if (!raw.scanner || typeof raw.scanner !== 'object' || Array.isArray(raw.scanner)) throw new Error('scanner output is missing scanner provenance');
  assertString(raw.scanner.name, 'scanner name');
  assertString(raw.scanner.version, 'scanner version');
  assertString(raw.scanner.scriptSha256, 'scanner scriptSha256');
  if (raw.scanner.name !== 'Agent Security Selfcheck') throw new Error('scanner producer name mismatch');
  if (!raw.target || typeof raw.target !== 'object' || Array.isArray(raw.target)) throw new Error('scanner output is missing target provenance');
  assertString(raw.target.assetId, 'target assetId');
  const expectedTargetId = data.targetId || data.oneTimeAuditId || data.runId;
  if (!expectedTargetId || raw.target.assetId !== expectedTargetId) throw new Error('scanner target asset identity mismatch');
  for (const field of ['hostname', 'ip']) if (field in raw.target) assertString(raw.target[field], `target ${field}`, { nonEmpty: false });
  if ('subjectType' in raw.target) assertString(raw.target.subjectType, 'target subjectType', { nonEmpty: false });
  if (data.subjectType !== undefined) {
    assertString(data.subjectType, 'expected target subjectType');
    if (!('subjectType' in raw.target) || raw.target.subjectType !== data.subjectType) throw new Error('scanner target subject type mismatch');
  }
  if (!Array.isArray(raw.findings)) throw new Error('scanner findings must be an array');
  if (!isDateTime(raw.collectedAt)) throw new Error('scanner collectedAt is not strict RFC3339');
  const metadata = raw.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('scanner output is missing metadata');
  if (!isDateTime(metadata.generated_utc) || metadata.generated_utc !== raw.collectedAt) throw new Error('scanner collectedAt provenance mismatch');
  assertString(metadata.script_sha256, 'scanner metadata script_sha256');
  assertString(metadata.script_version, 'scanner metadata script_version');
  if (metadata.script_sha256 !== raw.scanner.scriptSha256 || metadata.script_version !== raw.scanner.version) throw new Error('scanner metadata provenance mismatch');
  assertString(metadata.target_asset_id, 'scanner metadata target_asset_id');
  if (metadata.target_asset_id !== raw.target.assetId) throw new Error('scanner metadata target provenance mismatch');
  if (!metadata.coverage || typeof metadata.coverage !== 'object' || Array.isArray(metadata.coverage)) throw new Error('scanner metadata coverage is required');
  validateCoverage(metadata.coverage);
  if (JSON.stringify(metadata.coverage) !== JSON.stringify(raw.coverage)) throw new Error('scanner metadata coverage mismatch');
  const findings = raw.findings.map((finding, index) => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) throw new Error('scanner finding must be an object');
    for (const field of ['id', 'title', 'description', 'category', 'scope', 'confidence', 'reachability', 'evidenceKind', 'severity', 'status', 'risk']) assertString(finding[field], `scanner finding ${index} ${field}`, { nonEmpty: field !== 'description' });
    if (!VALID_SCOPE.has(finding.scope)) throw new Error(`scanner finding ${index} scope is invalid`);
    if (!VALID_CONFIDENCE.has(finding.confidence)) throw new Error(`scanner finding ${index} confidence is invalid`);
    if (!VALID_REACHABILITY.has(finding.reachability)) throw new Error(`scanner finding ${index} reachability is invalid`);
    if (!VALID_EVIDENCE_KIND.has(finding.evidenceKind)) throw new Error(`scanner finding ${index} evidenceKind is invalid`);
    if (!VALID_STATUS.has(finding.status)) throw new Error(`scanner finding ${index} status is invalid`);
    if (!VALID_RISK.has(finding.risk)) throw new Error(`scanner finding ${index} risk is invalid`);
    if (!VALID_SEVERITY.has(finding.severity)) throw new Error(`scanner finding ${index} severity is invalid`);
    if (!Number.isInteger(finding.severityScore) || finding.severityScore < 0) throw new Error(`scanner finding ${index} severityScore is invalid`);
    if (typeof finding.derived !== 'boolean') throw new Error(`scanner finding ${index} derived is invalid`);
    if (!Array.isArray(finding.derivedFrom) || finding.derivedFrom.some((item) => typeof item !== 'string' || !item)) throw new Error(`scanner finding ${index} derivedFrom is invalid`);
    validateEvidence(finding.evidence, index);
    if ('references' in finding && (!Array.isArray(finding.references) || finding.references.some((item) => typeof item !== 'string'))) throw new Error(`scanner finding ${index} references are invalid`);
    return {
      id: finding.id,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
      description: finding.description,
      evidence: finding.evidence,
      remediation: finding.remediation ?? null,
      source: finding.source || null,
      status: finding.status,
      risk: finding.risk,
      scope: finding.scope,
      confidence: finding.confidence,
      reachability: finding.reachability,
      evidenceKind: finding.evidenceKind,
      derived: finding.derived,
      derivedFrom: finding.derivedFrom,
    };
  });
  if (!Array.isArray(raw.executive_summary) || raw.executive_summary.some((item) => typeof item !== 'string')) throw new Error('scanner executive_summary must be a string array');
  if (!raw.score || typeof raw.score !== 'object' || Array.isArray(raw.score) || typeof raw.score.overall_score !== 'number' || typeof raw.score.grade !== 'string' || !raw.score.categories || typeof raw.score.categories !== 'object' || Array.isArray(raw.score.categories)) throw new Error('scanner score contract is invalid');
  return {
    contractVersion: scannerBundleContractVersion(),
    scanner: { name: raw.scanner.name, version: raw.scanner.version, scriptSha256: raw.scanner.scriptSha256 },
    target: { assetId: raw.target.assetId, subjectType: raw.target.subjectType, hostname: raw.target.hostname || 'unknown', ip: raw.target.ip },
    score: raw.score,
    executiveSummary: raw.executive_summary,
    coverage: raw.coverage,
    decision: raw.decision,
    findings,
    collectedAt: raw.collectedAt,
  };
}

function artifactTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.json') return 'scanner.raw_output';
  if (ext === '.md') return 'markdown';
  if (ext === '.sarif') return 'sarif';
  if (ext === '.pdf') return 'pdf';
  return 'json';
}

function contentTypeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.md') return 'text/markdown; charset=utf-8';
  if (ext === '.sarif') return 'application/sarif+json';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export async function resolveContainedPath(outDir, candidate) {
  const outRoot = resolve(outDir);
  const resolved = resolve(outDir, candidate);
  const relativePath = relative(outRoot, resolved);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new Error('scanner path escapes output directory');
  const realRoot = await realpath(outRoot);
  const realCandidate = await realpath(resolved);
  const realRelative = relative(realRoot, realCandidate);
  if (realRelative.startsWith('..') || isAbsolute(realRelative)) throw new Error('scanner path escapes output directory');
  return realCandidate;
}

export async function runBundledScanner(data) {
  const outDir = await mkdtemp(join(tmpdir(), `shore-sentinel-${data.runId}-`));
  try {
    const expectedTargetId = data.targetId || data.oneTimeAuditId || data.runId;
    const { stdout } = await execFileAsync('python3', [scannerPath, '--target', scannerTarget, '--asset-id', expectedTargetId, '--scope-mode', 'exact', '--out-dir', outDir, '--exit-zero'], {
      timeout: Number(process.env.SCANNER_TIMEOUT_MS || 120000),
      maxBuffer: 1024 * 1024 * 4,
    });
    const summary = JSON.parse(stdout.slice(stdout.indexOf('{')));
    const files = await readdir(outDir);
    const jsonReport = summary.reports?.json || files.find((file) => file.endsWith('.json'));
    if (!jsonReport) throw new Error('scanner output did not identify a JSON report');
    const reportPath = await resolveContainedPath(outDir, jsonReport);
    const raw = JSON.parse(await readFile(reportPath, 'utf8'));
    const artifacts = [];
    for (const file of files) {
      const artifactPath = await resolveContainedPath(outDir, file);
      artifacts.push({ path: artifactPath, filename: basename(file), kind: artifactTypeFor(file), contentType: contentTypeFor(file), body: await readFile(artifactPath) });
    }
    return { scannerOutput: toContract(raw, data), artifacts, summary };
  } finally {
    setTimeout(() => rm(outDir, { recursive: true, force: true }).catch(() => {}), 30000);
  }
}
