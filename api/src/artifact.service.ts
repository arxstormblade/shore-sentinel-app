import { Injectable } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

@Injectable()
export class ArtifactService {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'shore-sentinel-artifacts';
  private readonly client?: S3Client;
  constructor() {
    if (process.env.MINIO_ENDPOINT) this.client = new S3Client({ endpoint: process.env.MINIO_ENDPOINT, region: process.env.MINIO_REGION ?? 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'replace-me', secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'replace-me' } });
  }
  async createUpload(runId: string, artifactType: string, contentType?: string) {
    const objectKey = `runs/${runId}/${randomUUID()}.${artifactType === 'markdown' ? 'md' : artifactType}`;
    const storageUri = `s3://${this.bucket}/${objectKey}`;
    if (!this.client) return { object_key: objectKey, storage_uri: storageUri, upload_url: null };
    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }), { expiresIn: 900 });
    return { object_key: objectKey, storage_uri: storageUri, upload_url: uploadUrl };
  }
}
