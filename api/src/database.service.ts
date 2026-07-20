import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import { DEFAULT_TENANT_SLUG, ROLE_MATRIX } from './config.js';
import { SCHEMA_SQL } from './schema.js';
const { Pool } = pg;

const REQUIRED_PRODUCTION_SECRETS = [
  ['SHORE_SENTINEL_SECRET_KEY', 32],
  ['SEED_ADMIN_PASSWORD', 16],
  ['POSTGRES_PASSWORD', 16],
  ['MINIO_ACCESS_KEY', 16],
  ['MINIO_SECRET_KEY', 16],
  ['INTERNAL_WORKER_TOKEN', 16],
] as const;

const PLACEHOLDER_SECRET = /(replace(?:[-_\s]?me)?|change(?:[-_\s]?me)?|placeholder|default|example|todo)/i;

function isWeakSecret(value: string | undefined, minimumLength: number) {
  const normalized = value?.trim() ?? '';
  return normalized.length < minimumLength
    || PLACEHOLDER_SECRET.test(normalized)
    || /^(.)\1+$/.test(normalized);
}

export function validateProductionSecrets(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== 'production') return;
  const invalid = REQUIRED_PRODUCTION_SECRETS
    .filter(([name, minimumLength]) => isWeakSecret(environment[name], minimumLength))
    .map(([name]) => name);
  if (invalid.length) throw new Error(`Invalid production secrets: ${invalid.join(', ')}`);
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  public readonly pool: pg.Pool;
  private ready = false;
  constructor() {
    validateProductionSecrets();
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  async onModuleInit() { await this.migrate(); this.ready = true; }
  async onModuleDestroy() { await this.pool.end(); }
  isReady() { return this.ready; }
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) { return this.pool.query<T>(text, params); }
  async tenantId() { const result = await this.query<{ id: string }>('SELECT id FROM tenants WHERE slug=$1', [DEFAULT_TENANT_SLUG]); return result.rows[0].id; }
  async migrate() { await this.pool.query(SCHEMA_SQL); await this.seed(); }
  async seed() {
    const tenant = await this.query<{ id: string }>("INSERT INTO tenants (slug,name) VALUES ($1,$2) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name, updated_at=now() RETURNING id", [DEFAULT_TENANT_SLUG, 'Shore360']);
    const tenantId = tenant.rows[0].id;
    const roles: Record<string, string> = { admin: 'Full platform administration', operator: 'Day-to-day security operations', analyst: 'Review, triage, and reporting', viewer: 'Read-only oversight' };
    for (const [name, description] of Object.entries(roles)) await this.query('INSERT INTO roles (name,description) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET description=EXCLUDED.description', [name, description]);
    for (const [roleName, permissions] of Object.entries(ROLE_MATRIX)) {
      const role = await this.query<{ id: string }>('SELECT id FROM roles WHERE name=$1', [roleName]);
      for (const [feature, actions] of Object.entries(permissions)) await this.query('INSERT INTO role_feature_permissions (tenant_id,role_id,feature_area,can_read,can_add,can_edit,can_delete) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,role_id,feature_area) DO UPDATE SET can_read=EXCLUDED.can_read, can_add=EXCLUDED.can_add, can_edit=EXCLUDED.can_edit, can_delete=EXCLUDED.can_delete, updated_at=now()', [tenantId, role.rows[0].id, feature, actions.includes('read'), actions.includes('add'), actions.includes('edit'), actions.includes('delete')]);
    }
    await this.query("INSERT INTO settings (tenant_id, app_version, default_artifact_retention_days) VALUES ($1,'0.1.0',90) ON CONFLICT(tenant_id) DO UPDATE SET updated_at=now()", [tenantId]);
    await this.query("INSERT INTO retention_policies (tenant_id,name,retention_days,is_default) VALUES ($1,'Default 90 days',90,true) ON CONFLICT DO NOTHING", [tenantId]);
    await this.query("INSERT INTO environments (tenant_id,name,slug,description) VALUES ($1,'Production','production','Default production environment') ON CONFLICT(tenant_id,slug) DO NOTHING", [tenantId]);
    const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 12);
    const admin = await this.query<{ id: string }>("INSERT INTO users (tenant_id,email,display_name,password_hash) VALUES ($1,$2,'Initial Admin',$3) ON CONFLICT(email) DO UPDATE SET updated_at=now() RETURNING id", [tenantId, process.env.SEED_ADMIN_EMAIL ?? 'admin@shore360.local', hash]);
    const adminRole = await this.query<{ id: string }>("SELECT id FROM roles WHERE name='admin'");
    await this.query('INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [admin.rows[0].id, adminRole.rows[0].id]);
    await this.query("INSERT INTO knowledgebase_categories (tenant_id,name,slug,description,sort_order) VALUES ($1,'Getting Started','getting-started','Operator guides for audit and managed-machine workflows',10) ON CONFLICT(tenant_id,slug) DO NOTHING", [tenantId]);
  }
}
