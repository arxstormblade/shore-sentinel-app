export const QUEUES: Readonly<{
  scanJobs: 'shore-sentinel.scan.jobs';
  parseJobs: 'shore-sentinel.parse.jobs';
  artifactProcessing: 'shore-sentinel.artifact.processing';
  lifecycleEvents: 'shore-sentinel.lifecycle.events';
}>;

export const JOB_STATUS: Readonly<Record<string, string>>;
export const RUN_EVENT_TYPE: Readonly<{
  jobQueued: 'job.queued';
  jobClaimed: 'job.claimed';
  jobRunning: 'job.running';
  parseStarted: 'parse.started';
  parseSucceeded: 'parse.succeeded';
  artifactUploadRequested: 'artifact.upload_requested';
  artifactUploadSucceeded: 'artifact.upload_succeeded';
  jobRetryScheduled: 'job.retry_scheduled';
  jobSucceeded: 'job.succeeded';
  jobFailed: 'job.failed';
}>;

export const ARTIFACT_KIND: Readonly<{
  scannerRawOutput: 'scanner.raw_output';
  normalizedFindings: 'scanner.normalized_findings';
  enrichmentSummary: 'scanner.enrichment_summary';
}>;

export function buildRunEvent(args: Record<string, unknown>): Record<string, unknown>;
export function validateArtifactUpload(payload: Record<string, unknown>): { ok: boolean; errors: string[] };
export function scannerBundleContractVersion(): 'shore-sentinel.scanner-output/v1';
