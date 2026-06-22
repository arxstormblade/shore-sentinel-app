import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import * as IORedis from 'ioredis';
import { QUEUES } from '@shore-sentinel/shared';

const RedisCtor = (IORedis as unknown as { default?: new (...args: unknown[]) => unknown })?.default ?? (IORedis as unknown as new (...args: unknown[]) => unknown);

type QueueName = 'scan_jobs' | 'artifact_processing';

const QUEUE_NAMES: Record<QueueName, string> = {
  scan_jobs: QUEUES.scanJobs,
  artifact_processing: QUEUES.artifactProcessing,
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection?: any;
  private readonly queues = new Map<QueueName, Queue>();

  constructor() {
    if (process.env.REDIS_URL) {
      this.connection = new RedisCtor(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    }
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.connection) await this.connection.quit();
  }

  async health() {
    if (!this.connection) return { configured: false };
    await this.connection.connect().catch(() => undefined);
    return { configured: true, ping: await this.connection.ping(), queues: QUEUE_NAMES };
  }

  async enqueue(queueName: QueueName, payload: Record<string, unknown>) {
    if (!this.connection) return { queued: false, reason: 'REDIS_URL not configured' };
    await this.connection.connect().catch(() => undefined);
    const queue = this.queue(queueName);
    const jobName = typeof payload.type === 'string' ? payload.type : queueName;
    const job = await queue.add(jobName, { ...payload, enqueuedAt: new Date().toISOString() });
    await this.connection.xadd('shore:events', '*', 'type', queueName, 'queue', QUEUE_NAMES[queueName], 'jobId', String(job.id), 'payload', JSON.stringify(payload));
    return { queued: true, queue: QUEUE_NAMES[queueName], jobId: String(job.id) };
  }

  private queue(queueName: QueueName) {
    const existing = this.queues.get(queueName);
    if (existing) return existing;
    const created = new Queue(QUEUE_NAMES[queueName], { connection: this.connection });
    this.queues.set(queueName, created);
    return created;
  }
}
