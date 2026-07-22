import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { AuthorizationService } from '../engagement/authorization.service.js';

type GrantRequest = { tenantId: string; runId: string; engagementId: string; policyBundleId: string; policyHash: string; scope: Record<string, unknown>; expiresAt: Date };

@Injectable()
export class ExecutionGrantService {
  constructor(private readonly db: DatabaseService, private readonly authorization: AuthorizationService) {}

  async issue(input: GrantRequest) {
    if (input.expiresAt <= new Date()) throw new BadRequestException('execution grant must expire in the future');
    const decision = await this.authorization.authorize({ tenantId: input.tenantId, engagementId: input.engagementId, policyBundleId: input.policyBundleId, requestedScope: input.scope });
    if (!decision.allowed || decision.policyHash !== input.policyHash || decision.engagementId !== input.engagementId || decision.policyBundleId !== input.policyBundleId) throw new ForbiddenException(`execution authorization denied: ${decision.reason ?? 'policy decision mismatch'}`);
    const result = await this.db.query(
      `INSERT INTO execution_authorizations
       (tenant_id, engagement_id, policy_bundle_id, run_id, scope, policy_hash, expires_at, authorization_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       RETURNING id, tenant_id, engagement_id, policy_bundle_id, run_id, scope, policy_hash, expires_at`,
      [input.tenantId, input.engagementId, input.policyBundleId, input.runId, input.scope, input.policyHash, input.expiresAt],
    );
    if (!result.rows[0]) throw new ForbiddenException('execution authorization unavailable');
    return result.rows[0];
  }

  async consume(input: { tenantId: string; authorizationId: string; workloadIdentity: string; now?: Date }) {
    const result = await this.db.query(
      `UPDATE execution_authorizations ea
       SET consumed_at=COALESCE(consumed_at, now()), workload_identity=$3
       WHERE ea.tenant_id=$1 AND ea.id=$2 AND ea.revoked_at IS NULL AND ea.authorization_state='active'
         AND ea.expires_at > COALESCE($4::timestamptz, now())
         AND ea.consumed_at IS NULL
         AND EXISTS (SELECT 1 FROM workload_identities wi WHERE wi.tenant_id=ea.tenant_id AND wi.identity=$3 AND wi.revoked_at IS NULL AND wi.expires_at > COALESCE($4::timestamptz, now()))
       RETURNING ea.id, ea.run_id, ea.scope, ea.policy_hash, ea.expires_at`,
      [input.tenantId, input.authorizationId, input.workloadIdentity, input.now ?? null],
    );
    if (!result.rows[0]) throw new ForbiddenException('execution authorization unavailable');
    return result.rows[0];
  }

  async revoke(tenantId: string, authorizationId: string, actorId: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('revocation reason is required');
    const result = await this.db.query(`UPDATE execution_authorizations SET revoked_at=now(), authorization_state='revoked', revocation_reason=$3 WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id, revoked_at`, [tenantId, authorizationId, reason]);
    if (!result.rows[0]) throw new BadRequestException('execution authorization not found or already revoked');
    await this.db.query('INSERT INTO audit_log (tenant_id,actor_user_id,action,resource_type,resource_id,payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actorId, 'execution_authorization.revoked', 'execution_authorization', authorizationId, { reason }]);
    return result.rows[0];
  }
}
