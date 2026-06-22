import { Injectable } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

function extensionFor(artifactType: string) {
  if (artifactType === 'markdown') return 'md';
  if (artifactType === 'scanner.raw_output') return 'json';
  if (artifactType === 'scanner.normalized_findings') return 'json';
  if (artifactType === 'scanner.enrichment_summary') return 'json';
  return artifactType.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

@Injectable()
export class ArtifactService {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'shore-sentinel-artifacts';
  private readonly client?: S3Client;
  private bucketReady = false;
  constructor() {
    if (process.env.MINIO_ENDPOINT) this.client = new S3Client({ endpoint: process.env.MINIO_ENDPOINT, region: process.env.MINIO_REGION ?? 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'replace-me', secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'replace-me' } });
  }
  private async ensureBucket() {
    if (!this.client || this.bucketReady) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketReady = true;
  }
  async createUpload(runId: string, artifactType: string, contentType?: string) {
    await this.ensureBucket();
    const objectKey = `runs/${runId}/${randomUUID()}.${extensionFor(artifactType)}`;
    const storageUri = `s3://${this.bucket}/${objectKey}`;
    if (!this.client) return { object_key: objectKey, storage_uri: storageUri, upload_url: null };
    const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType }), { expiresIn: 900 });
    return { object_key: objectKey, storage_uri: storageUri, upload_url: uploadUrl };
  }
  async storeWorkerArtifact(runId: string, artifactType: string, body: Buffer, contentType?: string) {
    await this.ensureBucket();
    const objectKey = `runs/${runId}/${randomUUID()}.${extensionFor(artifactType)}`;
    const storageUri = `s3://${this.bucket}/${objectKey}`;
    if (this.client) {
      await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: body, ContentType: contentType }));
    }
    return { object_key: objectKey, storage_uri: storageUri };
  }
  async readArtifact(storageUri: string) {
    if (!this.client) throw new Error('artifact storage is not configured');
    const match = storageUri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) throw new Error('unsupported artifact storage uri');
    const response = await this.client.send(new GetObjectCommand({ Bucket: match[1], Key: match[2] }));
    return response.Body as Readable;
  }
}
