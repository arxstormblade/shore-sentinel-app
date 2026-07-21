import {
  CreateBucketCommand,
  GetBucketPolicyCommand,
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

let policy = null;
try {
  const result = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
  policy = result.Policy ? JSON.parse(result.Policy) : null;
} catch (error) {
  const code = error?.Code ?? error?.name;
  const status = error?.$metadata?.httpStatusCode;
  if (code !== 'NoSuchBucketPolicy' && status !== 404) throw error;
}

for (const statement of policy?.Statement ?? []) {
  if (statement.Effect !== 'Allow') continue;
  const principal = statement.Principal;
  const anonymous = principal === '*'
    || principal?.AWS === '*'
    || (Array.isArray(principal?.AWS) && principal.AWS.includes('*'))
    || principal?.AWS === 'arn:aws:iam:::user/anonymous';
  if (anonymous) throw new Error(`bucket ${bucket} has an anonymous allow policy`);
}

const anonymousProbe = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(bucket)}`);
if (anonymousProbe.status !== 403) {
  throw new Error(`bucket ${bucket} anonymous access probe returned HTTP ${anonymousProbe.status}; expected 403`);
}

process.stdout.write(`${JSON.stringify({ component: 'object-storage', bucket, private: true })}\n`);
