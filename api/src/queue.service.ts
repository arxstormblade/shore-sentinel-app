import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import * as IORedis from 'ioredis';
import { QUEUES } from '@shore-sentinel/shared';
import { DatabaseService } from './database.service.js';

const RedisCtor = (IORedis as unknown as { default?: new (...args: unknown[]) => unknown })?.default ?? (IORedis as unknown as new (...args: unknown[]) => unknown);

type QueueName = 'scan_jobs' | 'artifact_processing';

type WorkerRetryEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'WORKER_MAX_ATTEMPTS' | 'WORKER_BACKOFF_MS'>>;
export type ScanRetryPolicy = { attempts: number; backoff: { type: 'exponential'; delay: number } };

// This ceiling bounds both BullMQ persistence and every API grant transition.
// A deployment may lower it, but never turn a malformed setting into a long-lived retry loop.
export const SAFE_WORKER_MAX_ATTEMPTS = 10;
export const SAFE_WORKER_BACKOFF_MS = 60 * 60 * 1000;

// The durable outbox has an independent, short retry budget. A terminal row is
// retained for operations and emits an alert event rather than being retried forever.
export const SAFE_OUTBOX_DELIVERY_ATTEMPTS = 5;
export const OUTBOX_RETRY_BASE_MS = 30_000;
export const OUTBOX_RETRY_MAX_DELAY_MS = 30 * 60 * 1000;

class ScanDispatchDeliveryFailure extends Error {
  constructor() {
    super('delivery_failed');
  }
}

export function scanDispatchRetryDelayMs(attemptCount: number) {
  const exponent = Math.max(0, Math.min(Math.floor(attemptCount) - 1, 16));
  return Math.min(OUTBOX_RETRY_BASE_MS * (2 ** exponent), OUTBOX_RETRY_MAX_DELAY_MS);
}

function positiveInteger(env: WorkerRetryEnvironment, name: keyof WorkerRetryEnvironment, fallback: number, maximum: number) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return value;
}

// The API owns the options persisted on every BullMQ scan job. Worker options
// configure execution only; BullMQ reads retry policy from the job itself.
export function workerRetryPolicyFromEnv(env: WorkerRetryEnvironment = process.env) {
  return scanRetryPolicy(
    positiveInteger(env, 'WORKER_MAX_ATTEMPTS', 3, SAFE_WORKER_MAX_ATTEMPTS),
    positiveInteger(env, 'WORKER_BACKOFF_MS', 5000, SAFE_WORKER_BACKOFF_MS),
  );
}

export function scanRetryPolicy(attempts: unknown, backoffMs: unknown): ScanRetryPolicy {
  const validate = (value: unknown, name: string, maximum: number): number => {
    if (typeof value !== 'number') throw new Error(`${name} must be a positive bounded integer`);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be a positive bounded integer`);
    return value;
  };
  return {
    attempts: validate(attempts, 'retry_max_attempts', SAFE_WORKER_MAX_ATTEMPTS),
    backoff: { type: 'exponential', delay: validate(backoffMs, 'retry_backoff_ms', SAFE_WORKER_BACKOFF_MS) },
  };
}

// Retain the exported helper's legacy environment-object call shape while
// normalizing it before it reaches BullMQ. Normal delivery supplies a policy
// read from the durable outbox row, never the API process environment.
export function scanDispatchJobOptions(jobId: string | undefined, policy: ScanRetryPolicy | WorkerRetryEnvironment = workerRetryPolicyFromEnv()) {
  const normalized = 'attempts' in policy && 'backoff' in policy
    ? scanRetryPolicy(policy.attempts, policy.backoff?.delay)
    : workerRetryPolicyFromEnv(policy);
  return { ...normalized, ...(jobId ? { jobId } : {}) };
}

const QUEUE_NAMES: Record<QueueName, string> = {
  scan_jobs: QUEUES.scanJobs,
  artifact_processing: QUEUES.artifactProcessing,
};

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly connection?: any;
  private readonly queues = new Map<QueueName, Queue>();
  private outboxDrainTimer?: NodeJS.Timeout;
  private outboxDrainInFlight?: Promise<{ attempted: number; published: number }>;

  constructor(private readonly db: DatabaseService) {
    if (process.env.REDIS_URL) {
      this.connection = new RedisCtor(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    }
  }

  async onModuleInit() {
    void this.drainPendingScanDispatches().catch(() => undefined);
    this.outboxDrainTimer = setInterval(() => { void this.drainPendingScanDispatches().catch(() => undefined); }, 30_000);
    this.outboxDrainTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.outboxDrainTimer) clearInterval(this.outboxDrainTimer);
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.connection) await this.connection.quit();
  }

  async health() {
    if (!this.connection) return { configured: false };
    await this.connection.connect().catch(() => undefined);
    return { configured: true, ping: await this.connection.ping(), queues: QUEUE_NAMES };
  }

  async enqueue(queueName: QueueName, payload: Record<string, unknown>, jobId?: string, retryPolicy?: ScanRetryPolicy) {
    if (!this.connection) return { queued: false, reason: 'REDIS_URL not configured' };
    await this.connection.connect().catch(() => undefined);
    const queue = this.queue(queueName);
    const jobName = typeof payload.type === 'string' ? payload.type : queueName;
    const options = queueName === 'artifact_processing'
      ? { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
      : scanDispatchJobOptions(jobId, retryPolicy);
    const job = await queue.add(jobName, { ...payload, enqueuedAt: new Date().toISOString() }, options);
    await this.connection.xadd('shore:events', '*', 'type', queueName, 'queue', QUEUE_NAMES[queueName], 'jobId', String(job.id), 'payload', JSON.stringify(payload));
    return { queued: true, queue: QUEUE_NAMES[queueName], jobId: String(job.id) };
  }

  async deliverScanDispatch(dispatchId: string) {
    const pending = await this.db.query<{ id: string; tenant_id: string; run_id: string; queue_type: QueueName; payload: Record<string, unknown>; attempt_count: number; retry_max_attempts: number; retry_backoff_ms: number }>(`SELECT o.id,o.tenant_id,o.run_id,o.queue_type,o.payload,o.attempt_count,sj.retry_max_attempts,sj.retry_backoff_ms
      FROM scan_dispatch_outbox o
      JOIN scan_runs sr ON sr.id=o.run_id AND sr.tenant_id=o.tenant_id
      JOIN scan_jobs sj ON sj.id=o.job_id AND sj.tenant_id=o.tenant_id
      WHERE o.id=$1 AND o.published_at IS NULL AND o.failed_at IS NULL
        AND COALESCE(o.next_attempt_at,o.created_at) <= now()
        AND sr.status='pending' AND sr.cancellation_requested_at IS NULL AND sj.status='queued'`, [dispatchId]);
    const dispatch = pending.rows[0];
    if (!dispatch) return { published: false, reason: 'not_pending' };
    try {
      const queued = await this.enqueue(dispatch.queue_type, dispatch.payload, dispatch.id, scanRetryPolicy(dispatch.retry_max_attempts, dispatch.retry_backoff_ms));
      if (!queued.queued) throw new ScanDispatchDeliveryFailure();
      const marked = await this.db.query<{ id: string }>('UPDATE scan_dispatch_outbox SET published_at=now(), attempt_count=attempt_count+1, last_attempt_at=now(), next_attempt_at=NULL WHERE id=$1 AND published_at IS NULL AND failed_at IS NULL RETURNING id', [dispatch.id]);
      return { published: Boolean(marked.rows[0]), ...queued };
    } catch (error) {
      const attemptCount = dispatch.attempt_count + 1;
      if (attemptCount >= SAFE_OUTBOX_DELIVERY_ATTEMPTS) {
        await this.db.query(`WITH failed AS (
          UPDATE scan_dispatch_outbox SET attempt_count=attempt_count+1, last_attempt_at=now(), next_attempt_at=NULL,
            failed_at=now(), last_error='delivery_failed'
          WHERE id=$1 AND published_at IS NULL AND failed_at IS NULL
          RETURNING id,tenant_id,run_id,attempt_count
        )
        INSERT INTO notification_events (tenant_id,event_type,run_id,delivery_state,payload)
        SELECT tenant_id,'scan.dispatch_failed',run_id,'pending',jsonb_build_object(
          'dispatch_id',id,'attempt_count',attempt_count,'code','delivery_failed'
        ) FROM failed`, [dispatch.id]);
      } else {
        await this.db.query(`UPDATE scan_dispatch_outbox SET attempt_count=attempt_count+1, last_attempt_at=now(),
          next_attempt_at=now()+($2 * interval '1 millisecond')
          WHERE id=$1 AND published_at IS NULL AND failed_at IS NULL`, [dispatch.id, scanDispatchRetryDelayMs(attemptCount)]);
      }
      if (error instanceof ScanDispatchDeliveryFailure) return { published: false, queued: false, reason: 'delivery_failed' };
      throw error;
    }
  }

  async drainPendingScanDispatches(limit = 10) {
    if (this.outboxDrainInFlight) return this.outboxDrainInFlight;
    const boundedLimit = Math.min(Math.max(limit, 1), 25);
    const drain = (async () => {
      const pending = await this.db.query<{ id: string }>(`SELECT o.id
        FROM scan_dispatch_outbox o
        JOIN scan_runs sr ON sr.id=o.run_id AND sr.tenant_id=o.tenant_id
        JOIN scan_jobs sj ON sj.id=o.job_id AND sj.tenant_id=o.tenant_id
        WHERE o.published_at IS NULL AND o.failed_at IS NULL
          AND COALESCE(o.next_attempt_at,o.created_at) <= now()
          AND sr.status='pending' AND sr.cancellation_requested_at IS NULL AND sj.status='queued'
        ORDER BY COALESCE(o.next_attempt_at,o.created_at) ASC, o.created_at ASC LIMIT $1`, [boundedLimit]);
      const results = await Promise.allSettled(pending.rows.map(({ id }) => this.deliverScanDispatch(id)));
      return { attempted: pending.rows.length, published: results.filter((result) => result.status === 'fulfilled' && result.value.published).length };
    })();
    this.outboxDrainInFlight = drain;
    try {
      return await drain;
    } finally {
      if (this.outboxDrainInFlight === drain) this.outboxDrainInFlight = undefined;
    }
  }

  private queue(queueName: QueueName) {
    const existing = this.queues.get(queueName);
    if (existing) return existing;
    const created = new Queue(QUEUE_NAMES[queueName], { connection: this.connection });
    this.queues.set(queueName, created);
    return created;
  }
}
