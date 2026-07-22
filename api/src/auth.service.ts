import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { SessionService } from './session/session.service.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AuthService {
  private readonly sessions: SessionService;

  constructor(private readonly db: DatabaseService, sessions?: SessionService) {
    this.sessions = sessions ?? new SessionService(db);
  }

  async register(name: string, email: string, password: string, rememberMe = false) {
    const tenantId = await this.db.tenantId();
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows[0]) throw new ConflictException('Email already exists');
    const created = await this.db.query<{ id: string; tenant_id: string; email: string; display_name: string }>(
      'INSERT INTO users (tenant_id, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, tenant_id, email, display_name',
      [tenantId, normalizedEmail, name, passwordHash],
    );
    const user = created.rows[0];
    await this.db.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'operator' ON CONFLICT DO NOTHING", [user.id]);
    const session = await this.sessions.create({ userId: user.id, tenantId: user.tenant_id, rememberMe });
    await this.audit(user.tenant_id, user.id, 'auth.register_success', 'user', user.id, { rememberMe });
    return { token: session.token, user: { id: user.id, email: user.email, display_name: user.display_name } };
  }

  async login(email: string, password: string, rememberMe = false, context: { userAgent?: string; ipAddress?: string } = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.sessions.assertLoginAllowed(`email:${normalizedEmail}`);
    const result = await this.db.query<{ id: string; tenant_id: string; email: string; display_name: string; password_hash: string }>(
      'SELECT id, tenant_id, email, display_name, password_hash FROM users WHERE email = $1 AND disabled_at IS NULL', [normalizedEmail]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await this.sessions.recordLoginFailure(`email:${normalizedEmail}`);
      await this.audit(user?.tenant_id ?? await this.db.tenantId(), null, 'auth.login_failure', 'user', null, { email: normalizedEmail });
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.sessions.recordLoginSuccess(`email:${normalizedEmail}`);
    const session = await this.sessions.create({ userId: user.id, tenantId: user.tenant_id, rememberMe, userAgent: context.userAgent, ipAddress: context.ipAddress });
    await this.audit(user.tenant_id, user.id, 'auth.login_success', 'user', user.id, { rememberMe });
    return { token: session.token, user: { id: user.id, email: user.email, display_name: user.display_name } };
  }

  async logout(token?: string) { await this.sessions.revoke(token); }

  async me(token?: string) {
    const session = await this.sessions.resolve(token);
    const result = await this.db.query(
      'SELECT u.id, u.tenant_id, u.email, u.display_name, json_agg(r.name ORDER BY r.name) AS roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 AND u.tenant_id=$2 AND u.disabled_at IS NULL GROUP BY u.id',
      [session.userId, session.tenantId],
    );
    if (!result.rows[0]) throw new UnauthorizedException('Session principal is no longer valid');
    return result.rows[0];
  }

  async verifyMfa(token: string, valid: boolean) {
    if (!valid) throw new UnauthorizedException('MFA verification failed');
    await this.sessions.markMfaVerified(token);
    return { ok: true };
  }

  async stepUp(token: string, valid: boolean) {
    if (!valid) throw new UnauthorizedException('Step-up authentication failed');
    await this.sessions.markStepUp(token);
    return { ok: true };
  }

  private async audit(tenantId: string, actor: string | null, action: string, resourceType: string, resourceId: string | null, payload: Record<string, unknown>) {
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [tenantId, actor, action, resourceType, resourceId, payload]);
  }
}
