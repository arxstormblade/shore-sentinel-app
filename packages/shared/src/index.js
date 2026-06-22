export const QUEUES = Object.freeze({
  scanJobs: 'shore-sentinel.scan.jobs',
  parseJobs: 'shore-sentinel.parse.jobs',
  artifactProcessing: 'shore-sentinel.artifact.processing',
  lifecycleEvents: 'shore-sentinel.lifecycle.events',
});

export const JOB_STATUS = Object.freeze({
  queued: 'queued',
  claimed: 'claimed',
  running: 'running',
  parsing: 'parsing',
  artifactUploading: 'artifact_uploading',
  succeeded: 'succeeded',
  retrying: 'retrying',
  failed: 'failed',
});

export const RUN_EVENT_TYPE = Object.freeze({
  jobQueued: 'job.queued',
  jobClaimed: 'job.claimed',
  jobRunning: 'job.running',
  parseStarted: 'parse.started',
  parseSucceeded: 'parse.succeeded',
  artifactUploadRequested: 'artifact.upload_requested',
  artifactUploadSucceeded: 'artifact.upload_succeeded',
  jobRetryScheduled: 'job.retry_scheduled',
  jobSucceeded: 'job.succeeded',
  jobFailed: 'job.failed',
});

export const ARTIFACT_KIND = Object.freeze({
  scannerRawOutput: 'scanner.raw_output',
  normalizedFindings: 'scanner.normalized_findings',
  enrichmentSummary: 'scanner.enrichment_summary',
});

export function buildRunEvent({ runId, jobId, type, status, attempt = 1, message, metadata = {} }) {
  if (!runId) throw new Error('runId is required');
  if (!type) throw new Error('type is required');
  if (!status) throw new Error('status is required');
  return {
    runId,
    jobId: jobId ? String(jobId) : null,
    type,
    status,
    attempt,
    message: message || type,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

export function validateArtifactUpload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') errors.push('payload must be an object');
  if (!payload?.runId) errors.push('runId is required');
  if (!payload?.kind || !Object.values(ARTIFACT_KIND).includes(payload.kind)) errors.push('kind is invalid');
  if (!payload?.contentType) errors.push('contentType is required');
  if (!payload?.bodyBase64) errors.push('bodyBase64 is required');
  if (payload?.bodyBase64) {
    try { Buffer.from(payload.bodyBase64, 'base64'); } catch { errors.push('bodyBase64 must be valid base64'); }
  }
  return { ok: errors.length === 0, errors };
}

export function scannerBundleContractVersion() {
  return 'shore-sentinel.scanner-output/v1';
}
