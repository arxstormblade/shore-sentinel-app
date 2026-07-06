import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from './database.service.js';

const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_SESSION_MS = 1000 * 60 * 60 * 12;

type Session = {
  userId: string;
  tenantId: string;
  createdAt: Date;
  expiresAt: Date;
};

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly db: DatabaseService) {}

  async register(name: string, email: string, password: string, rememberMe = false) {
    const tenantId = await this.db.tenantId();
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await this.db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows[0]) throw new ConflictException('Email already exists');

    const created = await this.db.query<{ id: string; tenant_id: string; email: string; display_name: string }>(
      'INSERT INTO users (tenant_id, email, display_name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, tenant_id, email, display_name',
      [tenantId, email, name, passwordHash],
    );

    const user = created.rows[0];
    await this.db.query("INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'operator' ON CONFLICT DO NOTHING", [user.id]);
    const token = this.createSession(user.id, user.tenant_id, rememberMe);
    await this.audit(user.id, 'auth.register_success', 'user', user.id, { email, rememberMe });
    return { token, user: { id: user.id, email: user.email, display_name: user.display_name } };
  }

  async login(email: string, password: string, rememberMe = false) {
    const result = await this.db.query<{ id: string; tenant_id: string; email: string; display_name: string; password_hash: string }>(
      'SELECT id, tenant_id, email, display_name, password_hash FROM users WHERE email = $1 AND disabled_at IS NULL',
      [email],
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      await this.audit(null, 'auth.login_failure', 'user', null, { email });
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.createSession(user.id, user.tenant_id, rememberMe);
    await this.audit(user.id, 'auth.login_success', 'user', user.id, { rememberMe });
    return { token, user: { id: user.id, email: user.email, display_name: user.display_name } };
  }

  logout(token?: string) {
    if (token) this.sessions.delete(token);
  }

  async me(token?: string) {
    const session = token ? this.sessions.get(token) : undefined;
    if (!session) throw new UnauthorizedException('Not authenticated');
    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(token!);
      throw new UnauthorizedException('Session expired');
    }

    const result = await this.db.query(
      'SELECT u.id, u.email, u.display_name, json_agg(r.name ORDER BY r.name) AS roles FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=$1 GROUP BY u.id',
      [session.userId],
    );
    return result.rows[0];
  }

  private createSession(userId: string, tenantId: string, rememberMe = false) {
    const token = randomUUID();
    const now = Date.now();
    const expiresAt = new Date(now + (rememberMe ? THIRTY_DAYS_MS : DEFAULT_SESSION_MS));
    this.sessions.set(token, { userId, tenantId, createdAt: new Date(now), expiresAt });
    return token;
  }

  private async audit(actor: string | null, action: string, resourceType: string, resourceId: string | null, payload: Record<string, unknown>) {
    await this.db.query('INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [await this.db.tenantId(), actor, action, resourceType, resourceId, payload]);
  }
}
