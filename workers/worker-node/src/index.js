import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { JOB_STATUS, QUEUES, RUN_EVENT_TYPE, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { createApiClient } from './apiClient.js';
import { readConfig } from './config.js';
import { lifecycleEvent, retryDecision } from './lifecycle.js';
import { normalizeJobData } from './payload.js';
import { buildScanArtifactUploads } from './scanArtifacts.js';

const config = readConfig();
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.scanJobs, { connection });
const events = new QueueEvents(QUEUES.scanJobs, { connection });
const api = createApiClient(config.apiUrl);


async function emit(job, type, status, message, metadata = {}) {
  const data = normalizeJobData(job.data);
  const event = lifecycleEvent({
    runId: data.runId,
    jobId: job.id,
    type,
    status,
    attempt: job.attemptsMade + 1,
    message,
    metadata,
  });
  await api.emitRunEvent(event);
}

async function parseWithPython(job) {
  const data = normalizeJobData(job.data);
  const response = await fetch(`${config.pythonWorkerUrl}/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      runId: data.runId,
      scannerOutput: data.scannerOutput,
      contractVersion: scannerBundleContractVersion(),
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Python parser failed: ${response.status} ${text}`);
  }
  return response.json();
}

const worker = new Worker(QUEUES.scanJobs, async (job) => {
  const data = normalizeJobData(job.data);
  await emit(job, RUN_EVENT_TYPE.jobClaimed, JOB_STATUS.claimed, 'Node worker claimed scan job');
  await emit(job, RUN_EVENT_TYPE.jobRunning, JOB_STATUS.running, 'Scan job orchestration started');
  await emit(job, RUN_EVENT_TYPE.parseStarted, JOB_STATUS.parsing, 'Python parser requested');

  const parsed = await parseWithPython(job);

  await emit(job, RUN_EVENT_TYPE.parseSucceeded, JOB_STATUS.artifactUploading, 'Python parser completed', {
    findings: parsed.normalizedFindings.length,
  });

  const uploads = buildScanArtifactUploads({
    runId: data.runId,
    scannerOutput: data.scannerOutput,
    parsed,
  });

  for (const payload of uploads) {
    await emit(job, RUN_EVENT_TYPE.artifactUploadRequested, JOB_STATUS.artifactUploading, `Uploading ${payload.kind}`);
    await api.uploadArtifact(payload);
    await emit(job, RUN_EVENT_TYPE.artifactUploadSucceeded, JOB_STATUS.artifactUploading, `Uploaded ${payload.kind}`);
  }

  await emit(job, RUN_EVENT_TYPE.jobSucceeded, JOB_STATUS.succeeded, 'Scan job completed');
  return { artifacts: uploads.length, findings: parsed.normalizedFindings.length };
}, {
  connection,
  concurrency: config.concurrency,
  attempts: config.maxAttempts,
  backoff: { type: 'exponential', delay: config.backoffMs },
});

worker.on('failed', async (job, error) => {
  if (!job) return;
  const decision = retryDecision({ attemptsMade: job.attemptsMade, maxAttempts: config.maxAttempts, error });
  try {
    await emit(job, decision.eventType, decision.status, decision.message, decision.metadata);
  } catch (emitError) {
    console.error(JSON.stringify({ component: 'worker-node', failedEventEmit: emitError.message }));
  }
});

events.on('waiting', ({ jobId }) => {
  console.log(JSON.stringify({ component: 'worker-node', queue: QUEUES.scanJobs, jobId, status: 'waiting' }));
});

if (process.env.SEED_DEMO_JOB === 'true') {
  await queue.add('demo-scan', {
    runId: `demo-${Date.now()}`,
    scannerOutput: {
      contractVersion: scannerBundleContractVersion(),
      scanner: { name: 'demo-scanner', version: '0.1.0' },
      target: { assetId: 'demo-host', hostname: 'demo-host.local' },
      findings: [],
      collectedAt: new Date().toISOString(),
    },
  });
}

console.log(JSON.stringify({ component: 'worker-node', status: 'started', queue: QUEUES.scanJobs, redisUrl: config.redisUrl.replace(/:\/\/.*@/, '://***@') }));

async function shutdown(signal) {
  console.log(JSON.stringify({ component: 'worker-node', status: 'stopping', signal }));
  await worker.close();
  await events.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
