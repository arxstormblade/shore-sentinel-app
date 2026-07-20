import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';

type CleanupWork = {
  id: string;
  tenant_id?: string;
  artifact_id: string | null;
  storage_uri: string;
};

type CleanupSummary = {
  attempted: number;
  completed: number;
  failed: number;
};

@Injectable()
export class ArtifactService implements OnModuleInit, OnModuleDestroy {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'shore-sentinel-artifacts';
  private readonly client?: S3Client;
  private cleanupRecoveryTimer?: NodeJS.Timeout;
  private cleanupRecoveryRunning = false;

  constructor(private readonly db: DatabaseService) {
    if (process.env.MINIO_ENDPOINT) {
      this.client = new S3Client({
        endpoint: process.env.MINIO_ENDPOINT,
        region: process.env.MINIO_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'replace-me',
          secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'replace-me',
        },
      });
    }
  }

  prepare(runId: string, artifactType: string) {
    const objectKey = `runs/${runId}/${randomUUID()}.${artifactType === 'markdown' ? 'md' : artifactType}`;
    return { object_key: objectKey, storage_uri: `s3://${this.bucket}/${objectKey}` };
  }

  async store(storageUri: string, body: Buffer, contentType?: string) {
    if (!storageUri.startsWith(`s3://${this.bucket}/`)) throw new Error('unsupported artifact storage uri');
    if (!this.client) throw new Error('artifact object storage is not configured');
    const objectKey = storageUri.slice(`s3://${this.bucket}/`.length);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    }));
  }

  async delete(storageUri: string) {
    if (!this.client) throw new Error('artifact object storage is not configured');
    const key = this.objectKey(storageUri);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async onModuleInit() {
    void this.reconcilePendingCleanup().catch(() => undefined);
    this.cleanupRecoveryTimer = setInterval(() => { void this.reconcilePendingCleanup().catch(() => undefined); }, 30_000);
    this.cleanupRecoveryTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.cleanupRecoveryTimer) clearInterval(this.cleanupRecoveryTimer);
  }

  /**
   * Queue-independent, bounded durable recovery. The atomic claim below prevents
   * a timer overlap or duplicate worker job from deleting one object twice.
   */
  async reconcilePendingCleanup(limit = 25): Promise<CleanupSummary> {
    if (this.cleanupRecoveryRunning) return { attempted: 0, completed: 0, failed: 0 };
    this.cleanupRecoveryRunning = true;
    try {
      const work = await this.db.query<CleanupWork>(`SELECT id, tenant_id, artifact_id, storage_uri
        FROM artifact_cleanup_work
        WHERE status='pending'
          OR (status='failed' AND updated_at <= now() - (interval '1 second' * LEAST(300, CAST(power(2, LEAST(attempt_count, 8)) AS integer))))
          OR (status='processing' AND updated_at < now() - interval '5 minutes')
        ORDER BY created_at
        LIMIT $1`, [Math.min(Math.max(limit, 1), 25)]);
      return this.processCleanupWork(work.rows, false);
    } finally {
      this.cleanupRecoveryRunning = false;
    }
  }

  async reconcileCleanup(runId: string): Promise<CleanupSummary> {
    const work = await this.db.query<CleanupWork>(`SELECT w.id, w.tenant_id, w.artifact_id, w.storage_uri
      FROM artifact_cleanup_work w
      JOIN scan_runs sr ON sr.id=w.run_id AND sr.tenant_id=w.tenant_id
      WHERE w.run_id=$1
        AND (w.status IN ('pending','failed') OR (w.status='processing' AND w.updated_at < now() - interval '5 minutes'))
      ORDER BY w.created_at
      LIMIT 100`, [runId]);
    return this.processCleanupWork(work.rows, true);
  }

  private async processCleanupWork(work: CleanupWork[], allowImmediateRetry: boolean, defaultTenantId?: string): Promise<CleanupSummary> {
    const summary: CleanupSummary = { attempted: 0, completed: 0, failed: 0 };

    for (const candidate of work) {
      const tenantId = candidate.tenant_id ?? defaultTenantId;
      if (!tenantId) continue;
      const claim = await this.db.query<CleanupWork>(`UPDATE artifact_cleanup_work
        SET status='processing', attempt_count=attempt_count+1, last_error=NULL, updated_at=now()
        WHERE tenant_id=$1 AND id=$2
          AND (status='pending'
            OR ($3::boolean AND status='failed')
            OR (status='failed' AND updated_at <= now() - (interval '1 second' * LEAST(300, CAST(power(2, LEAST(attempt_count, 8)) AS integer))))
            OR (status='processing' AND updated_at < now() - interval '5 minutes'))
        RETURNING id, artifact_id, storage_uri`, [tenantId, candidate.id, allowImmediateRetry]);
      const item = claim.rows[0];
      if (!item) continue;
      summary.attempted += 1;

      try {
        await this.delete(item.storage_uri);
      } catch (error) {
        if (!this.isAlreadyMissing(error)) {
          summary.failed += 1;
          await this.db.query(`UPDATE artifact_cleanup_work
            SET status='failed', last_error=$3, updated_at=now()
            WHERE tenant_id=$1 AND id=$2 AND status='processing'`, [tenantId, item.id, this.cleanupError(error)]);
          continue;
        }
      }

      const completed = await this.db.query(`WITH deleted_artifact AS (
        DELETE FROM artifacts
        WHERE tenant_id=$1 AND id=$3 AND parse_status='quarantined'
        RETURNING id
      ), safe_to_complete AS (
        SELECT 1 WHERE EXISTS (SELECT 1 FROM deleted_artifact)
          OR NOT EXISTS (SELECT 1 FROM artifacts WHERE tenant_id=$1 AND id=$3)
      )
      UPDATE artifact_cleanup_work w
      SET status='completed', artifact_id=NULL, completed_at=now(), last_error=NULL, updated_at=now()
      FROM safe_to_complete
      WHERE w.tenant_id=$1 AND w.id=$2 AND w.status='processing'
      RETURNING w.id`, [tenantId, item.id, item.artifact_id]);
      if (completed.rows[0]) {
        summary.completed += 1;
      } else {
        summary.failed += 1;
        await this.db.query(`UPDATE artifact_cleanup_work
          SET status='failed', last_error='artifact metadata was not quarantined', updated_at=now()
          WHERE tenant_id=$1 AND id=$2 AND status='processing'`, [tenantId, item.id]);
      }
    }
    return summary;
  }

  async download(storageUri: string) {
    if (!this.client) throw new Error('artifact object storage is not configured');
    const key = this.objectKey(storageUri);
    return this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private objectKey(storageUri: string) {
    const prefix = `s3://${this.bucket}/`;
    if (!storageUri.startsWith(prefix)) throw new Error('unsupported artifact storage uri');
    const key = storageUri.slice(prefix.length);
    if (!key || key.startsWith('/') || key.split('/').some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f\\]/.test(part))) {
      throw new Error('unsupported artifact storage uri');
    }
    return key;
  }

  private isAlreadyMissing(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { name?: unknown; Code?: unknown; code?: unknown; $metadata?: { httpStatusCode?: unknown } };
    return candidate.name === 'NoSuchKey'
      || candidate.name === 'NotFound'
      || candidate.Code === 'NoSuchKey'
      || candidate.code === 'NoSuchKey'
      || candidate.$metadata?.httpStatusCode === 404;
  }

  private cleanupError(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 1024) : 'artifact deletion failed';
  }
}
