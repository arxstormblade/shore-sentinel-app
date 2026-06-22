import { buildRunEvent, JOB_STATUS, RUN_EVENT_TYPE } from '@shore-sentinel/shared';

export function retryDecision({ attemptsMade = 0, maxAttempts = 3, error }) {
  const nextAttempt = attemptsMade + 1;
  const retry = nextAttempt < maxAttempts;
  return {
    retry,
    nextAttempt,
    status: retry ? JOB_STATUS.retrying : JOB_STATUS.failed,
    eventType: retry ? RUN_EVENT_TYPE.jobRetryScheduled : RUN_EVENT_TYPE.jobFailed,
    message: retry ? `Retry ${nextAttempt + 1}/${maxAttempts} scheduled` : 'Job failed permanently',
    metadata: { error: error?.message || String(error || 'unknown error') },
  };
}

export function lifecycleEvent(input) {
  return buildRunEvent(input);
}

export function artifactUploadPayload({ runId, kind, contentType, body, metadata = {} }) {
  const buffer = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  return {
    runId,
    kind,
    contentType,
    bodyBase64: buffer.toString('base64'),
    metadata,
  };
}
