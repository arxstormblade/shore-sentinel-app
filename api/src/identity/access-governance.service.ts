import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';

@Injectable()
export class AccessGovernanceService {
  constructor(private readonly db: DatabaseService) {}

  async listGroups(tenantId: string) { return (await this.db.query('SELECT id, name, created_at FROM user_groups WHERE tenant_id=$1 ORDER BY name', [tenantId])).rows; }

  async createGroup(tenantId: string, name: string, actorId: string) {
    if (!name.trim()) throw new BadRequestException('group name is required');
    const result = await this.db.query('INSERT INTO user_groups (tenant_id,name) VALUES ($1,$2) RETURNING id,name,created_at', [tenantId, name.trim()]);
    await this.audit(tenantId, actorId, 'identity.group_created', result.rows[0]?.id ?? null, { name: name.trim() });
    return result.rows[0];
  }

  async addMember(tenantId: string, groupId: string, userId: string, actorId: string) {
    const membership = await this.db.query('SELECT g.id FROM user_groups g JOIN users u ON u.tenant_id=g.tenant_id WHERE g.tenant_id=$1 AND g.id=$2 AND u.id=$3', [tenantId, groupId, userId]);
    if (!membership.rows[0]) throw new BadRequestException('group or user not found');
    await this.db.query('INSERT INTO user_group_members (group_id,user_id,tenant_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [groupId, userId, tenantId]);
    await this.audit(tenantId, actorId, 'identity.group_member_added', groupId, { user_id: userId });
    return { groupId, userId };
  }

  async listRoles() { return (await this.db.query('SELECT name,description FROM roles ORDER BY name')).rows; }

  async listDevices(tenantId: string, userId: string) {
    return (await this.db.query('SELECT id,device_id,user_agent,ip_address,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at FROM auth_sessions WHERE tenant_id=$1 AND user_id=$2 ORDER BY last_seen_at DESC', [tenantId, userId])).rows;
  }

  async revokeDevice(tenantId: string, deviceId: string, actorId: string) {
    const result = await this.db.query('UPDATE auth_sessions SET revoked_at=now(), revoked_reason=\'device_revoked\', revoked_by=$3 WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id', [tenantId, deviceId, actorId]);
    if (!result.rows[0]) throw new BadRequestException('device session not found');
    await this.audit(tenantId, actorId, 'identity.device_revoked', deviceId, {});
    return { revoked: true, id: deviceId };
  }

  async beginBreakGlass(input: { tenantId: string; actorId: string; reason: string; ticketReference: string; expiresAt: Date }) {
    if (!input.reason.trim() || !input.ticketReference.trim()) throw new BadRequestException('break-glass reason and ticket are required');
    if (input.expiresAt <= new Date() || input.expiresAt.getTime() - Date.now() > 60 * 60 * 1000) throw new ForbiddenException('break-glass window is invalid');
    const result = await this.db.query('INSERT INTO break_glass_events (tenant_id,actor_user_id,reason,ticket_reference,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id,reason,ticket_reference,expires_at,created_at', [input.tenantId, input.actorId, input.reason.trim(), input.ticketReference.trim(), input.expiresAt]);
    await this.audit(input.tenantId, input.actorId, 'identity.break_glass_started', result.rows[0]?.id ?? null, { ticket_reference: input.ticketReference.trim(), expires_at: input.expiresAt.toISOString() });
    return result.rows[0];
  }

  private async audit(tenantId: string, actorId: string, action: string, resourceId: string | null, payload: Record<string, unknown>) {
    await this.db.query('INSERT INTO audit_log (tenant_id,actor_user_id,action,resource_type,resource_id,payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actorId, action, 'identity', resourceId, payload]);
  }
}
