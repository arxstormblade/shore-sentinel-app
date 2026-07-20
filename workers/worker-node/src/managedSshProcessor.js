import { ARTIFACT_KIND, JOB_STATUS, RUN_EVENT_TYPE } from '@shore-sentinel/shared';
import { artifactUploadPayload, lifecycleEvent, retryDecision } from './lifecycle.js';
import { normalizeSshJob } from './sshExecutor.js';
import { assertScannerOutputBytes, RAW_SCANNER_ARTIFACT_MAX_BYTES } from './payloadLimits.js';


function withTimeout(promise, timeoutMs, label) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error(`${label} timeout must be a positive integer`);
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

async function assertActive(api, runId, timeoutMs) {
  const control = await withTimeout(api.getRunControl(runId), timeoutMs, 'worker run control');
  if (control?.cancelled) throw new Error(`Scan run ${runId} was cancelled`);
}

async function emit(api, job, runId, workerCapability, attempt, type, status, message, metadata, timeoutMs) {
  await withTimeout(api.emitRunEvent(lifecycleEvent({ runId, jobId: job.id, type, status, attempt, message, metadata: metadata ?? {} }), workerCapability), timeoutMs, 'worker lifecycle event');
}

export async function emitManagedSshFailure(job, api, { maxAttempts = 3, error, lifecycleEventTimeoutMs = 10000, failureState } = {}) {
  const state = failureState ?? error?.managedSshFailure ?? job.managedSshFailure;
  if (!state) return false;
  const data = normalizeSshJob(job.data);
  // Preserve the original failure metadata if delivery itself fails. A later
  // BullMQ failed callback must submit the same server transition, not a new
  // transition based on BullMQ's already-incremented attemptsMade counter.
  state.failure ??= { maxAttempts: state.maxAttempts ?? maxAttempts, error: error?.message || String(error || 'unknown error') };
  const decision = retryDecision({ attempt: state.attempt, maxAttempts: state.failure.maxAttempts, error: state.failure.error });
  await withTimeout(api.emitRunEvent(lifecycleEvent({
    runId: data.runId, jobId: job.id, type: decision.eventType, status: decision.status,
    attempt: state.attempt, message: decision.message, metadata: decision.metadata,
  }), state.workerCapability), lifecycleEventTimeoutMs, 'worker failure lifecycle event');
  delete job.managedSshFailure;
  return true;
}

function monitorCancellation(api, runId, controller, intervalMs, timeoutMs) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('SSH cancellation poll interval must be a positive integer');
  let stopped = false;
  let timer;
  const poll = async () => {
    if (stopped || controller.signal.aborted) return;
    try {
      const control = await withTimeout(api.getRunControl(runId), timeoutMs, 'worker run control');
      if (control?.cancelled) return controller.abort();
    } catch {
      return controller.abort();
    }
    if (!stopped) timer = setTimeout(poll, intervalMs);
  };
  void poll();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}

export function scannerOutputFromSsh(result) {
  if (!result || result.exitCode !== 0) throw new Error('SSH remote runner did not complete successfully');
  const raw = typeof result.stdout === 'string' ? result.stdout : result.scannerOutput;
  if (typeof raw === 'string') {
    assertScannerOutputBytes(raw);
    try { return { scannerOutput: JSON.parse(raw), rawScannerOutput: raw }; } catch { throw new Error('SSH remote runner returned invalid JSON'); }
  }
  if (raw && typeof raw === 'object') {
    let rawScannerOutput;
    try { rawScannerOutput = JSON.stringify(raw); } catch { throw new Error('SSH remote runner returned invalid JSON'); }
    assertScannerOutputBytes(rawScannerOutput);
    return { scannerOutput: raw, rawScannerOutput };
  }
  throw new Error('SSH remote runner returned no structured result');
}

export async function processManagedSshJob(job, {
  api, execute, parse, contractVersion, cancellationPollMs = 1000,
  parserTimeoutMs = 120000, artifactHandoffTimeoutMs = 30000, lifecycleEventTimeoutMs = 10000,
}) {
  const failureState = {};
  try {
    return await processManagedSshJobSteps(job, { api, execute, parse, contractVersion, cancellationPollMs, parserTimeoutMs, artifactHandoffTimeoutMs, lifecycleEventTimeoutMs }, failureState);
  } catch (error) {
    if (failureState.workerCapability && error && typeof error === 'object') error.managedSshFailure = failureState;
    throw error;
  }
}

async function processManagedSshJobSteps(job, {
  api, execute, parse, contractVersion, cancellationPollMs,
  parserTimeoutMs, artifactHandoffTimeoutMs, lifecycleEventTimeoutMs,
}, failureState) {
  const data = normalizeSshJob(job.data);
  const attempt = job.attemptsMade + 1;
  await assertActive(api, data.runId, lifecycleEventTimeoutMs);
  const grant = await withTimeout(api.fetchSshGrant(data.runId, data.targetId, attempt), lifecycleEventTimeoutMs, 'SSH grant acquisition');
  if (typeof grant?.grantId !== 'string' || grant.grantId.length === 0 || grant?.attempt !== attempt || typeof grant?.workerCapability !== 'string' || grant.workerCapability.length === 0 || !Number.isSafeInteger(grant?.maxAttempts) || grant.maxAttempts < attempt) {
    throw new Error('SSH execution grant is missing attempt-scoped capability identifier');
  }
  failureState.attempt = attempt;
  failureState.maxAttempts = grant.maxAttempts;
  failureState.workerCapability = grant.workerCapability;
  // Ephemeral only: this is never written to BullMQ job data. Restart recovery
  // deliberately goes through the API's persisted grant state.
  Object.defineProperty(job, 'managedSshFailure', { value: failureState, configurable: true });
  await assertActive(api, data.runId, lifecycleEventTimeoutMs);
  await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.jobClaimed, JOB_STATUS.claimed, 'Node worker claimed managed SSH scan job', {}, lifecycleEventTimeoutMs);
  await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.jobRunning, JOB_STATUS.running, 'Managed SSH scan started', {}, lifecycleEventTimeoutMs);
  const controller = new AbortController();
  const stopCancellationMonitor = monitorCancellation(api, data.runId, controller, cancellationPollMs, lifecycleEventTimeoutMs);
  let sshResult;
  try { sshResult = await execute(grant, { signal: controller.signal }); } finally { stopCancellationMonitor(); }
  await assertActive(api, data.runId, lifecycleEventTimeoutMs);
  const { scannerOutput, rawScannerOutput } = scannerOutputFromSsh(sshResult);
  await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.parseStarted, JOB_STATUS.parsing, 'Python parser requested for managed SSH result', {}, lifecycleEventTimeoutMs);
  const parsed = await withTimeout(parse({ runId: data.runId, scannerOutput, contractVersion: contractVersion() }), parserTimeoutMs, 'Python parser');
  await assertActive(api, data.runId, lifecycleEventTimeoutMs);
  await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.parseSucceeded, JOB_STATUS.artifactUploading, 'Python parser completed', { findings: parsed.normalizedFindings.length }, lifecycleEventTimeoutMs);
  const uploads = [
    artifactUploadPayload({ runId: data.runId, attempt, kind: ARTIFACT_KIND.scannerRawOutput, contentType: 'application/json', body: rawScannerOutput, metadata: { contractVersion: contractVersion(), source: 'managed_ssh' }, maxBytes: RAW_SCANNER_ARTIFACT_MAX_BYTES }),
    artifactUploadPayload({ runId: data.runId, attempt, kind: ARTIFACT_KIND.normalizedFindings, contentType: 'application/json', body: parsed.normalizedFindings, metadata: { parserVersion: parsed.parserVersion } }),
    artifactUploadPayload({ runId: data.runId, attempt, kind: ARTIFACT_KIND.enrichmentSummary, contentType: 'application/json', body: parsed.enrichmentSummary, metadata: { parserVersion: parsed.parserVersion } }),
  ];
  for (const payload of uploads) {
    await assertActive(api, data.runId, lifecycleEventTimeoutMs);
    await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.artifactUploadRequested, JOB_STATUS.artifactUploading, `Uploading ${payload.kind}`, {}, lifecycleEventTimeoutMs);
    await withTimeout(api.uploadArtifact(payload, grant.workerCapability), artifactHandoffTimeoutMs, 'artifact handoff');
    await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.artifactUploadSucceeded, JOB_STATUS.artifactUploading, `Uploaded ${payload.kind}`, {}, lifecycleEventTimeoutMs);
  }
  await assertActive(api, data.runId, lifecycleEventTimeoutMs);
  await emit(api, job, data.runId, grant.workerCapability, attempt, RUN_EVENT_TYPE.jobSucceeded, JOB_STATUS.succeeded, 'Managed SSH scan job completed', {}, lifecycleEventTimeoutMs);
  return { artifacts: uploads.length, findings: parsed.normalizedFindings.length };
}

export { assertActive, withTimeout };
