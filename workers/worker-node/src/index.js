import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUES, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { createApiClient } from './apiClient.js';
import { readConfig } from './config.js';
import { emitManagedSshFailure, processManagedSshJob } from './managedSshProcessor.js';
import { handleManagedSshFailure } from './failureHandling.js';
import { createParserClient } from './parserClient.js';
import { executePinnedScan } from './sshExecutor.js';

const config = readConfig();
const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUES.scanJobs, { connection });
const events = new QueueEvents(QUEUES.scanJobs, { connection });
const api = createApiClient(config.apiUrl, config.internalWorkerToken);

const parseWithPython = createParserClient({
  pythonWorkerUrl: config.pythonWorkerUrl,
  internalWorkerToken: config.internalWorkerToken,
});


const worker = new Worker(QUEUES.scanJobs, async (job) => {
  try {
    return await processManagedSshJob(job, {
      api,
      execute: (context) => executePinnedScan(context, { timeoutMs: config.sshTimeoutMs }),
      parse: parseWithPython,
      contractVersion: scannerBundleContractVersion,
      parserTimeoutMs: config.parserTimeoutMs,
      artifactHandoffTimeoutMs: config.artifactHandoffTimeoutMs,
      lifecycleEventTimeoutMs: config.lifecycleEventTimeoutMs,
    });
  } catch (error) {
    const failure = await handleManagedSshFailure({ job, error, api, lifecycleEventTimeoutMs: config.lifecycleEventTimeoutMs });
    if (failure.cancelled) return { cancelled: true };
    throw error;
  }
}, {
  connection,
  concurrency: config.concurrency,

});

async function processArtifactCleanupJob(job) {
  const { type, tenantId, runId } = job.data ?? {};
  if (type !== 'artifact.cleanup' || typeof tenantId !== 'string' || typeof runId !== 'string') {
    throw new Error('Invalid artifact cleanup job');
  }
  const result = await api.reconcileArtifactCleanup({ tenantId, runId });
  if (result.failed > 0) throw new Error('Artifact cleanup reconciliation incomplete');
  return result;
}

const artifactCleanupWorker = new Worker(QUEUES.artifactProcessing, processArtifactCleanupJob, {
  connection,
  concurrency: config.concurrency,
});

worker.on('failed', async (job, error) => {
  if (!job) return;
  try {
    await emitManagedSshFailure(job, api, { error, lifecycleEventTimeoutMs: config.lifecycleEventTimeoutMs });
  } catch (emitError) {
    console.error(JSON.stringify({ component: 'worker-node', lifecycleDeliveryPending: true, failedEventEmit: emitError.message }));
  }
});

events.on('waiting', ({ jobId }) => {
  console.log(JSON.stringify({ component: 'worker-node', queue: QUEUES.scanJobs, jobId, status: 'waiting' }));
});

console.log(JSON.stringify({ component: 'worker-node', status: 'started', queue: QUEUES.scanJobs, redisUrl: config.redisUrl.replace(/:\/\/.*@/, '://***@') }));

async function shutdown(signal) {
  console.log(JSON.stringify({ component: 'worker-node', status: 'stopping', signal }));
  await worker.close();
  await artifactCleanupWorker.close();
  await events.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
