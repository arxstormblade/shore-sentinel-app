import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const MIGRATION_LOCK_KEY = 2_147_483_001;
const MIGRATION_NAME = /^(\d{4})_[a-z0-9_-]+\.sql$/;

type QueryResult = { rows: Array<Record<string, unknown>> };
export type Migration = { version: string; name: string; sql: string; checksum: string };
export type MigrationClient = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};
export type MigrationPool = { connect: () => Promise<MigrationClient> };

export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrations: Migration[] = [];
  const versions = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_NAME.exec(entry.name);
    if (!match) continue;
    const version = match[1];
    if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    versions.add(version);
    const sql = await readFile(join(directory, entry.name), 'utf8');
    migrations.push({ version, name: entry.name, sql, checksum: migrationChecksum(sql) });
  }
  migrations.sort((left, right) => left.version.localeCompare(right.version));
  if (!migrations.length) throw new Error(`No SQL migrations found in ${directory}`);
  return migrations;
}

function migrationDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');
}

export async function runMigrations(
  pool: MigrationPool,
  options: { migrationsDir?: string; lockTimeoutMs?: number } = {},
): Promise<{ applied: string[]; current: string | null }> {
  const migrations = await discoverMigrations(options.migrationsDir ?? migrationDirectory());
  const lockTimeoutMs = Math.max(100, Math.floor(options.lockTimeoutMs ?? 10_000));
  const client = await pool.connect();
  let transactionOpen = false;
  let lockHeld = false;
  const applied: string[] = [];
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`);
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    lockHeld = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const existingResult = await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
    const existing = new Map(existingResult.rows.map((row) => [String(row.version), String(row.checksum)]));
    await client.query('COMMIT');
    transactionOpen = false;

    for (const migration of migrations) {
      const previousChecksum = existing.get(migration.version);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.name}`);
        }
        continue;
      }
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
        [migration.version, migration.checksum],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      existing.set(migration.version, migration.checksum);
      applied.push(migration.version);
    }
    return { applied, current: migrations.at(-1)?.version ?? null };
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    if (lockHeld) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

export async function main(argv = process.argv): Promise<void> {
  if (argv[2] !== 'migrate') return;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await runMigrations(pool, { lockTimeoutMs: Number(process.env.MIGRATION_LOCK_TIMEOUT_MS ?? 10_000) });
    process.stdout.write(`${JSON.stringify({ component: 'migration', status: 'complete', ...result })}\n`);
  } finally {
    await pool.end();
  }
}

if (process.argv[2] === 'migrate') {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'migration failed';
    process.stderr.write(`${JSON.stringify({ component: 'migration', status: 'failed', error: message })}\n`);
    process.exitCode = 1;
  });
}
