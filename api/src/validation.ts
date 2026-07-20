import { BadRequestException } from '@nestjs/common';
import { ALLOWED_ARTIFACT_TYPES, MAX_ARTIFACT_BYTES, WORKER_ARTIFACT_MAX_BYTES } from './config.js';

export const MAX_SCAN_TARGET_LENGTH = 1024;
export const WORKER_ARTIFACT_HANDOFFS = 3;
export const WORKER_LIFECYCLE_EVENT_CALLS = 12;

export type WorkerExecutionTimeBudget = {
  sshTimeoutMs: number;
  parserTimeoutMs: number;
  artifactHandoffTimeoutMs: number;
  lifecycleEventTimeoutMs: number;
  grantLifetimeMs: number;
};

function positiveTimeBudget(env: NodeJS.ProcessEnv, name: string, fallback: number) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new BadRequestException(`${name} must be a positive integer milliseconds value`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60 * 1000) {
    throw new BadRequestException(`${name} must be between 1 and 3600000 milliseconds`);
  }
  return value;
}

/**
 * The credential/capability lease is deliberately larger than the entire bounded
 * attempt: SSH, parser, three artifact handoffs, lifecycle events (including the
 * failure event), plus one second of scheduling slack. Both API and node worker
 * consume these same environment names/defaults.
 */
export function workerExecutionTimeBudget(env: NodeJS.ProcessEnv = process.env): WorkerExecutionTimeBudget {
  const sshTimeoutMs = positiveTimeBudget(env, 'SSH_EXECUTION_TIMEOUT_MS', 120_000);
  const parserTimeoutMs = positiveTimeBudget(env, 'PARSER_TIMEOUT_MS', 120_000);
  const artifactHandoffTimeoutMs = positiveTimeBudget(env, 'ARTIFACT_HANDOFF_TIMEOUT_MS', 30_000);
  const lifecycleEventTimeoutMs = positiveTimeBudget(env, 'LIFECYCLE_EVENT_TIMEOUT_MS', 10_000);
  const maximumAttemptMs = sshTimeoutMs
    + parserTimeoutMs
    + (WORKER_ARTIFACT_HANDOFFS * artifactHandoffTimeoutMs)
    + (WORKER_LIFECYCLE_EVENT_CALLS * lifecycleEventTimeoutMs);
  return { sshTimeoutMs, parserTimeoutMs, artifactHandoffTimeoutMs, lifecycleEventTimeoutMs, grantLifetimeMs: maximumAttemptMs + 1_000 };
}

export function requireWorkerAttempt(value: unknown) {
  const attempt = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 100) throw new BadRequestException('attempt must be a positive integer no greater than 100');
  return attempt;
}

export function validateScanTarget(value?: unknown) {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) return '.';
  if (typeof value !== 'string') throw new BadRequestException('scan_target must be a string');
  if (value.length > MAX_SCAN_TARGET_LENGTH) throw new BadRequestException(`scan_target is too long (maximum ${MAX_SCAN_TARGET_LENGTH} characters)`);
  if (/[\u0000-\u001f\u007f\\]/.test(value)) throw new BadRequestException('scan_target contains invalid characters');
  if (value.split('/').includes('..')) throw new BadRequestException('scan_target contains a relative traversal segment');
  if (value !== '.' && !value.startsWith('/')) throw new BadRequestException('scan_target must be "." or an absolute POSIX directory');
  return value;
}

export function assertExactlyOneSubject(subjectType: string, targetId?: string | null, oneTimeAuditId?: string | null) {
  const hasTarget = Boolean(targetId);
  const hasAudit = Boolean(oneTimeAuditId);
  if (hasTarget === hasAudit) throw new BadRequestException('Exactly one subject reference is required: target_id or one_time_audit_id.');
  if (subjectType === 'managed_target' && !hasTarget) throw new BadRequestException('managed_target jobs must reference target_id only.');
  if (subjectType === 'one_time_audit' && !hasAudit) throw new BadRequestException('one_time_audit jobs must reference one_time_audit_id only.');
}

export function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) throw new BadRequestException(`${field} is required`);
  return value.trim();
}

export function validateArtifactType(artifactType: string) {
  if (!(ALLOWED_ARTIFACT_TYPES as readonly string[]).includes(artifactType)) throw new BadRequestException(`artifact_type must be one of ${ALLOWED_ARTIFACT_TYPES.join(', ')}`);
  return artifactType;
}

export function validateArtifactComplete(body: Record<string, unknown>) {
  const artifactType = validateArtifactType(requireString(body, 'artifact_type'));
  const sha256 = requireString(body, 'sha256');
  if (!/^[a-fA-F0-9]{64}$/.test(sha256)) throw new BadRequestException('sha256 must be a 64-character hex digest');
  const sizeBytes = Number(body.size_bytes);
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_ARTIFACT_BYTES) throw new BadRequestException(`size_bytes must be between 1 and ${MAX_ARTIFACT_BYTES}`);
  return { artifactType, sha256: sha256.toLowerCase(), sizeBytes };
}

/**
 * Reject non-RFC4648 encodings and calculate decoded length before Buffer.from
 * allocates the artifact body. The worker contract deliberately uses padded,
 * standard base64 only: no whitespace, URL alphabet, or unpadded variants.
 */
export function validateCanonicalWorkerArtifactBase64(value: unknown) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    throw new BadRequestException('bodyBase64 must be canonical base64');
  }
  const maxEncodedLength = 4 * Math.ceil(WORKER_ARTIFACT_MAX_BYTES / 3);
  if (value.length > maxEncodedLength || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new BadRequestException('bodyBase64 must be canonical base64');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const decodedByteLength = (value.length / 4) * 3 - padding;
  if (decodedByteLength < 1 || decodedByteLength > WORKER_ARTIFACT_MAX_BYTES) {
    throw new BadRequestException(`artifact body must be between 1 and ${WORKER_ARTIFACT_MAX_BYTES} bytes`);
  }
  return decodedByteLength;
}
