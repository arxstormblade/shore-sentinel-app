import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

export type Approval = { approverId: string; role: string; revokedAt?: string | Date | null };
export type AuthorizationDecision = { allowed: boolean; reason?: string; engagementId?: string; policyBundleId?: string; policyHash?: string };
export type AuthorizationInput = {
  engagement: { id: string; tenantId: string; expiresAt: string | Date; revokedAt?: string | Date | null; ownerAuthorized: boolean; scope: Record<string, unknown> };
  approvals: Approval[];
  policy: { id: string; hash: string; active: boolean };
  expectedPolicyHash?: string;
  requestedScope: Record<string, unknown>;
  now?: Date;
};

function active(value: unknown, now: Date) { return value == null || new Date(String(value)).getTime() > now.getTime(); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function scopeAllows(allowed: unknown, requested: unknown): boolean {
  if (Array.isArray(allowed)) return Array.isArray(requested) && requested.every((item) => allowed.some((candidate) => JSON.stringify(candidate) === JSON.stringify(item)));
  if (allowed && typeof allowed === 'object' && requested && typeof requested === 'object' && !Array.isArray(allowed) && !Array.isArray(requested)) {
    return Object.entries(requested).every(([key, value]) => key in allowed && scopeAllows((allowed as Record<string, unknown>)[key], value));
  }
  return JSON.stringify(allowed) === JSON.stringify(requested);
}

export function evaluateExecutionAuthorization(input: AuthorizationInput): AuthorizationDecision {
  const now = input.now ?? new Date();
  if (input.engagement.revokedAt != null) return { allowed: false, reason: 'engagement revoked' };
  if (new Date(input.engagement.expiresAt).getTime() <= now.getTime()) return { allowed: false, reason: 'engagement expired' };
  if (!input.engagement.ownerAuthorized) return { allowed: false, reason: 'asset owner authorization missing' };
  const approvals = input.approvals.filter((approval) => !approval.revokedAt && active(approval.revokedAt, now));
  const owner = approvals.find((approval) => approval.role === 'owner');
  const reviewer = approvals.find((approval) => approval.role === 'reviewer' || approval.role === 'security');
  if (!owner || !reviewer || owner.approverId === reviewer.approverId) return { allowed: false, reason: 'distinct dual approval missing' };
  if (!scopeAllows(input.engagement.scope, input.requestedScope)) return { allowed: false, reason: 'requested scope exceeds engagement' };
  if (!input.policy.active) return { allowed: false, reason: 'policy bundle is not active' };
  if (input.expectedPolicyHash && input.policy.hash !== input.expectedPolicyHash) return { allowed: false, reason: 'policy bundle hash drift' };
  return { allowed: true, engagementId: input.engagement.id, policyBundleId: input.policy.id, policyHash: input.policy.hash };
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly db: DatabaseService) {}

  async createEngagement(input: { tenantId: string; name: string; ownerTeam: string; scope: Record<string, unknown>; budget: Record<string, unknown>; expiresAt: Date; createdBy: string }) {
    if (input.expiresAt <= new Date()) throw new BadRequestException('engagement expiry must be in the future');
    if (!input.name.trim() || !input.ownerTeam.trim()) throw new BadRequestException('engagement identity is required');
    const result = await this.db.query('INSERT INTO engagements (tenant_id,name,owner_team,scope,budget,expires_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, tenant_id, name, owner_team, scope, budget, expires_at, revoked_at, created_by, created_at', [input.tenantId, input.name.trim(), input.ownerTeam.trim(), input.scope, input.budget, input.expiresAt, input.createdBy]);
    return result.rows[0];
  }

  async approveEngagement(input: { tenantId: string; engagementId: string; approverId: string; role: 'owner' | 'reviewer' | 'security' }) {
    const engagement = await this.db.query('SELECT id, created_by, revoked_at, expires_at FROM engagements WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.engagementId]);
    if (!engagement.rows[0]) throw new BadRequestException('engagement not found');
    if (engagement.rows[0].revoked_at || new Date(String(engagement.rows[0].expires_at)).getTime() <= Date.now()) throw new ForbiddenException('engagement is inactive');
    if (input.role === 'owner' && engagement.rows[0].created_by === input.approverId) throw new ForbiddenException('owner approval must be independent');
    const result = await this.db.query('INSERT INTO engagement_approvals (tenant_id,engagement_id,approver_id,approval_role) VALUES ($1,$2,$3,$4) ON CONFLICT (engagement_id,approver_id,approval_role) DO NOTHING RETURNING id, engagement_id, approver_id, approval_role, approved_at', [input.tenantId, input.engagementId, input.approverId, input.role]);
    if (!result.rows[0]) throw new ConflictApprovalError();
    return result.rows[0];
  }

  async revokeEngagement(tenantId: string, engagementId: string, actorId: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('revocation reason is required');
    const result = await this.db.query('UPDATE engagements SET revoked_at=now() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id, revoked_at', [tenantId, engagementId]);
    if (!result.rows[0]) throw new BadRequestException('engagement not found or already revoked');
    await this.db.query('INSERT INTO audit_log (tenant_id,actor_user_id,action,resource_type,resource_id,payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actorId, 'engagement.revoked', 'engagement', engagementId, { reason }]);
    return result.rows[0];
  }

  async authorize(input: { tenantId: string; engagementId: string; policyBundleId: string; expectedPolicyHash?: string; requestedScope: Record<string, unknown>; now?: Date }): Promise<AuthorizationDecision> {
    if (!UUID.test(input.engagementId) || !UUID.test(input.policyBundleId)) return { allowed: false, reason: 'authorization records unavailable' };
    const [engagement, approvals, policy] = await Promise.all([
      this.db.query('SELECT id, tenant_id, expires_at, revoked_at, owner_authorized, scope FROM engagements WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.engagementId]),
      this.db.query('SELECT approver_id, approval_role AS role, revoked_at FROM engagement_approvals WHERE tenant_id=$1 AND engagement_id=$2', [input.tenantId, input.engagementId]),
      this.db.query('SELECT id, bundle_hash AS hash, active FROM policy_bundles WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.policyBundleId]),
    ]);
    const row = engagement.rows[0];
    const decision = row && policy.rows[0] ? evaluateExecutionAuthorization({ engagement: { id: String(row.id), tenantId: String(row.tenant_id), expiresAt: row.expires_at as string, revokedAt: row.revoked_at as string | null, ownerAuthorized: row.owner_authorized === true, scope: (row.scope ?? {}) as Record<string, unknown> }, approvals: approvals.rows.map((approval) => ({ approverId: String(approval.approver_id), role: String(approval.role), revokedAt: approval.revoked_at as string | null })), policy: { id: String(policy.rows[0].id), hash: String(policy.rows[0].hash), active: policy.rows[0].active === true }, expectedPolicyHash: input.expectedPolicyHash, requestedScope: input.requestedScope, now: input.now }) : { allowed: false, reason: 'authorization records unavailable' };
    return decision;
  }

  async simulate(input: Parameters<AuthorizationService['authorize']>[0]) { return this.authorize(input); }
}

class ConflictApprovalError extends ConflictException {
  constructor() { super('approval already recorded'); }
}
