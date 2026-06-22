import { BadRequestException } from '@nestjs/common';
import { ALLOWED_ARTIFACT_TYPES, MAX_ARTIFACT_BYTES } from './config.js';

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
