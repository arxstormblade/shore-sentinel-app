import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database.service.js';

export type SessionPrincipal = { userId: string; tenantId: string };
export type SessionOptions = { userId: string; tenantId: string; userAgent?: string; ipAddress?: string; deviceId?: string; rememberMe?: boolean; mfaVerifiedAt?: Date };
type Clock = { clock?: () => Date; tokenBytes?: number; idleMs?: number; absoluteMs?: number };

function tokenHash(token: string) { return createHash('sha256').update(token, 'utf8').digest('hex'); }
function asDate(value: unknown): Date | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

@Injectable()
export class SessionService {
  private readonly clock: () => Date;
  private readonly tokenBytes: number;
  private readonly idleMs: number;
  private readonly absoluteMs: number;

  constructor(private readonly db: DatabaseService, @Optional() options?: Clock) {
    this.clock = options?.clock ?? (() => new Date());
    this.tokenBytes = options?.tokenBytes ?? 32;
    this.idleMs = options?.idleMs ?? 1000 * 60 * 60 * 12;
    this.absoluteMs = options?.absoluteMs ?? 1000 * 60 * 60 * 24 * 30;
  }

  async create(options: SessionOptions) {
    const now = this.clock();
    const token = randomBytes(this.tokenBytes).toString('hex');
    const idleExpiresAt = new Date(now.getTime() + this.idleMs);
    const absoluteExpiresAt = new Date(now.getTime() + (options.rememberMe ? this.absoluteMs : Math.min(this.absoluteMs, this.idleMs)));
    await this.db.query(
      `INSERT INTO auth_sessions
       (id, tenant_id, user_id, session_token_hash, created_at, last_seen_at, idle_expires_at, absolute_expires_at, mfa_verified_at, user_agent, ip_address, device_id)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11)`,
      [randomUUID(), options.tenantId, options.userId, tokenHash(token), now, idleExpiresAt, absoluteExpiresAt, options.mfaVerifiedAt ?? null, options.userAgent ?? null, options.ipAddress ?? null, options.deviceId ?? null],
    );
    return { token, idleExpiresAt, absoluteExpiresAt };
  }

  async resolve(token?: string): Promise<SessionPrincipal> {
    if (!token) throw new UnauthorizedException('Not authenticated');
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT s.user_id, s.tenant_id, s.idle_expires_at, s.absolute_expires_at, s.revoked_at
       FROM auth_sessions s
       WHERE s.session_token_hash=$1`, [tokenHash(token)],
    );
    const session = result.rows[0];
    const userId = String(session?.user_id ?? session?.id ?? '');
    const tenantId = String(session?.tenant_id ?? '');
    const now = this.clock();
    const idle = asDate(session?.idle_expires_at);
    const absolute = asDate(session?.absolute_expires_at);
    if (!session || !userId || !tenantId || session.revoked_at != null || !idle || !absolute || absolute < idle || idle <= now || absolute <= now) {
      throw new UnauthorizedException('Session expired or revoked');
    }
    const principal = await this.db.query<Record<string, unknown>>(
      'SELECT u.id, u.tenant_id, u.email, u.display_name, json_agg(r.name ORDER BY r.name) AS roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.disabled_at IS NULL GROUP BY u.id',
      [userId, tenantId],
    );
    if (!principal.rows[0]) throw new UnauthorizedException('Session principal is no longer valid');
    const refreshedIdleExpiresAt = new Date(Math.min(now.getTime() + this.idleMs, absolute.getTime()));
    await this.db.query('UPDATE auth_sessions SET last_seen_at=$1, idle_expires_at=$2 WHERE session_token_hash=$3 AND revoked_at IS NULL AND absolute_expires_at>$1', [now, refreshedIdleExpiresAt, tokenHash(token)]);
    return { userId, tenantId };
  }

  async revoke(token: string | undefined, actorUserId?: string) {
    if (!token) return;
    await this.db.query('UPDATE auth_sessions SET revoked_at=$1, revoked_reason=$2, revoked_by=$3 WHERE session_token_hash=$4 AND revoked_at IS NULL', [this.clock(), 'logout', actorUserId ?? null, tokenHash(token)]);
  }

  async revokeUserSessions(tenantId: string, userId: string, actorUserId?: string) {
    await this.db.query('UPDATE auth_sessions SET revoked_at=$1, revoked_reason=$2, revoked_by=$3 WHERE tenant_id=$4 AND user_id=$5 AND revoked_at IS NULL', [this.clock(), 'administrative_revocation', actorUserId ?? null, tenantId, userId]);
  }

  async assertLoginAllowed(key: string) {
    const result = await this.db.query<{ blocked: boolean }>(
      `WITH current_window AS (
         SELECT key, window_started_at, failures FROM auth_throttles WHERE key=$1 FOR UPDATE
       )
       SELECT (failures >= 5 AND window_started_at > now() - interval '15 minutes') AS blocked FROM current_window`, [key]);
    if (result.rows[0]?.blocked) throw new UnauthorizedException('Authentication temporarily unavailable');
  }

  async recordLoginFailure(key: string) {
    await this.db.query(
      `INSERT INTO auth_throttles (key, window_started_at, failures, updated_at)
       VALUES ($1, now(), 1, now())
       ON CONFLICT (key) DO UPDATE SET failures=CASE WHEN auth_throttles.window_started_at <= now() - interval '15 minutes' THEN 1 ELSE auth_throttles.failures+1 END, window_started_at=CASE WHEN auth_throttles.window_started_at <= now() - interval '15 minutes' THEN now() ELSE auth_throttles.window_started_at END, updated_at=now()`, [key]);
  }

  async recordLoginSuccess(key: string) { await this.db.query('DELETE FROM auth_throttles WHERE key=$1', [key]); }

  async markMfaVerified(sessionToken: string, at = this.clock()) {
    await this.db.query('UPDATE auth_sessions SET mfa_verified_at=$1 WHERE session_token_hash=$2 AND revoked_at IS NULL', [at, tokenHash(sessionToken)]);
  }

  async markStepUp(sessionToken: string, at = this.clock()) {
    await this.db.query('UPDATE auth_sessions SET step_up_at=$1 WHERE session_token_hash=$2 AND revoked_at IS NULL', [at, tokenHash(sessionToken)]);
  }

  async requireStepUp(sessionToken: string, maxAgeMs = 1000 * 60 * 10) {
    const result = await this.db.query<{ step_up_at: Date | string | null }>('SELECT step_up_at FROM auth_sessions WHERE session_token_hash=$1 AND revoked_at IS NULL', [tokenHash(sessionToken)]);
    const stepUpAt = asDate(result.rows[0]?.step_up_at);
    if (!stepUpAt || this.clock().getTime() - stepUpAt.getTime() > maxAgeMs) throw new UnauthorizedException('Recent step-up authentication required');
    return true;
  }
}

export { tokenHash };
