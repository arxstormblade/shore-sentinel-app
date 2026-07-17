import { BadRequestException } from '@nestjs/common';
import { ALLOWED_ARTIFACT_TYPES, MAX_ARTIFACT_BYTES } from './config.js';

export const MAX_SCAN_TARGET_LENGTH = 1024;

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
