import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { promisify } from 'node:util';
import { scannerBundleContractVersion } from '@shore-sentinel/shared';

const execFileAsync = promisify(execFile);

const scannerPath = process.env.SCANNER_SCRIPT || '/app/scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py';
const scannerTarget = process.env.SCANNER_TARGET || '/app';

function severityFromRisk(risk) {
  const normalized = String(risk || '').toLowerCase();
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('medium') || normalized.includes('moderate')) return 'moderate';
  if (normalized.includes('low')) return 'low';
  return 'informational';
}

function toContract(raw, data) {
  const metadata = raw.metadata || {};
  return {
    contractVersion: scannerBundleContractVersion(),
    scanner: {
      name: 'Agent Security Selfcheck',
      version: metadata.script_version || '3.4.0',
      scriptSha256: metadata.script_sha256,
    },
    target: {
      assetId: data.targetId || data.oneTimeAuditId || data.runId,
      subjectType: data.subjectType,
      hostname: metadata.target_root || scannerTarget,
    },
    score: raw.score,
    executiveSummary: raw.executive_summary,
    findings: Array.isArray(raw.findings) ? raw.findings.map((finding, index) => ({
      id: finding.id || finding.check_id || `finding-${index + 1}`,
      title: finding.title || finding.check || `Finding ${index + 1}`,
      severity: severityFromRisk(finding.risk),
      category: finding.category || finding.section || 'agent-security-selfcheck',
      description: finding.description || finding.detail || finding.summary || '',
      evidence: finding.evidence ? [String(finding.evidence)] : [],
      remediation: finding.remediation_task || finding.remediation || finding.recommendation || null,
      source: 'Agent_Security_Selfcheck_v3.4.0.py',
      status: finding.status,
      risk: finding.risk,
    })) : [],
    collectedAt: metadata.generated_utc || new Date().toISOString(),
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

export async function runBundledScanner(data) {
  const outDir = await mkdtemp(join(tmpdir(), `shore-sentinel-${data.runId}-`));
  try {
    const { stdout } = await execFileAsync('python3', [scannerPath, '--target', scannerTarget, '--out-dir', outDir, '--exit-zero'], {
      timeout: Number(process.env.SCANNER_TIMEOUT_MS || 120000),
      maxBuffer: 1024 * 1024 * 4,
    });
    const summary = JSON.parse(stdout.slice(stdout.indexOf('{')));
    const files = await readdir(outDir);
    const jsonReport = summary.reports?.json || files.find((file) => file.endsWith('.json'));
    const raw = JSON.parse(await readFile(jsonReport.startsWith('/') ? jsonReport : join(outDir, jsonReport), 'utf8'));
    const artifacts = [];
    for (const file of files) {
      const fullPath = join(outDir, file);
      artifacts.push({
        path: fullPath,
        filename: basename(file),
        kind: artifactTypeFor(file),
        contentType: contentTypeFor(file),
        body: await readFile(fullPath),
      });
    }
    return { scannerOutput: toContract(raw, data), artifacts, summary };
  } finally {
    setTimeout(() => rm(outDir, { recursive: true, force: true }).catch(() => {}), 30000);
  }
}
