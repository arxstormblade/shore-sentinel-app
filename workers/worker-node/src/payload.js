import { scannerBundleContractVersion } from '@shore-sentinel/shared';

export function normalizeJobData(data) {
  const runId = data.runId ?? data.run_id;
  const jobId = data.jobId ?? data.job_id ?? data.id;
  const subjectType = data.subjectType ?? data.subject_type;
  const targetId = data.targetId ?? data.target_id ?? null;
  const oneTimeAuditId = data.oneTimeAuditId ?? data.one_time_audit_id ?? null;
  const scannerOutput = data.scannerOutput ?? {
    contractVersion: scannerBundleContractVersion(),
    scanner: { name: 'shore-sentinel-bundled-scanner', version: data.scannerVersion ?? data.scanner_version ?? '3.4.0' },
    target: { assetId: targetId ?? oneTimeAuditId ?? jobId ?? runId, subjectType },
    findings: [],
    collectedAt: new Date().toISOString(),
  };
  if (!runId) throw new Error('scan job payload missing runId/run_id');
  return { ...data, runId, jobId, subjectType, targetId, oneTimeAuditId, scannerOutput };
}
