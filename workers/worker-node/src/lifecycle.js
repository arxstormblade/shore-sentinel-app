import { buildRunEvent, JOB_STATUS, RUN_EVENT_TYPE } from '@shore-sentinel/shared';

// Must match api/src/config.ts WORKER_ARTIFACT_MAX_BYTES. The handoff is
// deliberately bounded below the object-store upload limit to avoid buffering
// multi-megabyte scanner output in worker/API process memory.
export const WORKER_ARTIFACT_MAX_BYTES = 1024 * 1024;

export function retryDecision({ attempt, attemptsMade, maxAttempts = 3, error }) {
  // A BullMQ failed event increments attemptsMade before it is emitted. Callers
  // that own an execution grant must therefore pass that grant's attempt.
  const currentAttempt = attempt ?? ((attemptsMade ?? 0) + 1);
  const retry = currentAttempt < maxAttempts;
  return {
    retry,
    attempt: currentAttempt,
    nextAttempt: retry ? currentAttempt + 1 : null,
    status: retry ? JOB_STATUS.retrying : JOB_STATUS.failed,
    eventType: retry ? RUN_EVENT_TYPE.jobRetryScheduled : RUN_EVENT_TYPE.jobFailed,
    message: retry ? `Retry ${currentAttempt + 1}/${maxAttempts} scheduled` : 'Job failed permanently',
    metadata: { error: error?.message || String(error || 'unknown error') },
  };
}

export function lifecycleEvent(input) {
  return buildRunEvent(input);
}

export function artifactUploadPayload({ runId, attempt, kind, contentType, body, metadata = {}, maxBytes = WORKER_ARTIFACT_MAX_BYTES }) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('artifact byte limit must be a positive integer');
  let serialized;
  try {
    serialized = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  } catch {
    throw new Error('artifact body is not valid JSON');
  }
  if (typeof serialized !== 'string') throw new Error('artifact body is not valid JSON');
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new Error('artifact body exceeds configured byte limit');
  return {
    runId,
    attempt,
    kind,
    contentType,
    bodyBase64: Buffer.from(serialized, 'utf8').toString('base64'),
    metadata,
  };
}
