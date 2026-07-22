import {
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const endpoint = process.env.MINIO_ENDPOINT;
const bucket = process.env.MINIO_BUCKET;
const accessKeyId = process.env.MINIO_ACCESS_KEY;
const secretAccessKey = process.env.MINIO_SECRET_KEY;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  throw new Error('MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY are required');
}

const client = new S3Client({
  endpoint,
  forcePathStyle: true,
  region: 'us-east-1',
  credentials: { accessKeyId, secretAccessKey },
});

try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
} catch (error) {
  const code = error?.Code ?? error?.name;
  if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw error;
}

await client.send(new HeadBucketCommand({ Bucket: bucket }));

try {
  await client.send(new DeleteBucketPolicyCommand({ Bucket: bucket }));
} catch (error) {
  const code = error?.Code ?? error?.name;
  const status = error?.$metadata?.httpStatusCode;
  if (code !== 'NoSuchBucketPolicy' && status !== 404) throw error;
}

const anonymousProbe = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(bucket)}`);
if (anonymousProbe.status !== 403) {
  throw new Error(`bucket ${bucket} anonymous access probe returned HTTP ${anonymousProbe.status}; expected 403`);
}

process.stdout.write(`${JSON.stringify({ component: 'object-storage', bucket, private: true })}\n`);
