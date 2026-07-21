import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { DEFAULT_TENANT_SLUG } from './config.js';
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
  async onModuleInit() {
    const result = await this.pool.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
    if (!result.rows.some(({ version }) => version === '0004')) {
      throw new Error('Database migrations are incomplete');
    }
    this.ready = true;
  }
  async onModuleDestroy() { await this.pool.end(); }
  isReady() { return this.ready; }
  async query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) { return this.pool.query<T>(text, params); }
  async tenantId() { const result = await this.query<{ id: string }>('SELECT id FROM tenants WHERE slug=$1', [DEFAULT_TENANT_SLUG]); return result.rows[0].id; }
}
