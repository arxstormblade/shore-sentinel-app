import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverMigrations, migrationChecksum, runMigrations } from '../src/migration-runner.js';

test('discovers migrations in lexical order and computes stable SHA-256 checksums', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shore-migrations-'));
  await writeFile(join(directory, '0002_second_migration.sql'), 'select 2;\n');
  await writeFile(join(directory, '0001_first.sql'), 'select 1;\n');
  await writeFile(join(directory, 'README.md'), 'ignored');

  const migrations = await discoverMigrations(directory);
  assert.deepEqual(migrations.map((migration) => migration.version), ['0001', '0002']);
  assert.equal(migrations[0].checksum, createHash('sha256').update('select 1;\n').digest('hex'));
  assert.equal(migrationChecksum('select 1;\n'), migrations[0].checksum);
});

test('rejects duplicate migration versions before touching the database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shore-migrations-'));
  await writeFile(join(directory, '0001_first.sql'), 'select 1;\n');
  await writeFile(join(directory, '0001_second.sql'), 'select 2;\n');
  await assert.rejects(() => discoverMigrations(directory), /duplicate migration version/i);
});

test('takes the PostgreSQL advisory lock and applies each migration in its own transaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shore-migrations-'));
  await writeFile(join(directory, '0001_first.sql'), 'select 1;\n');
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT version, checksum FROM schema_migrations')) return { rows: [] };
      return { rows: [] };
    },
    release: () => calls.push('release'),
  };
  const pool = { connect: async () => client };

  await runMigrations(pool as never, { migrationsDir: directory, lockTimeoutMs: 5000 });
  assert.equal(calls[0], 'BEGIN');
  assert.match(calls[1], /SET LOCAL lock_timeout/);
  assert.match(calls[2], /pg_advisory_lock/);
  assert.match(calls.join('\n'), /CREATE TABLE IF NOT EXISTS schema_migrations/);
  assert.match(calls.join('\n'), /INSERT INTO schema_migrations/);
  assert.equal(calls.at(-1), 'release');
});

test('fails closed on checksum drift and never executes a drifted migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shore-migrations-'));
  await writeFile(join(directory, '0001_first.sql'), 'select 1;\n');
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT version, checksum FROM schema_migrations')) return { rows: [{ version: '0001', checksum: 'bad' }] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  await assert.rejects(() => runMigrations({ connect: async () => client } as never, { migrationsDir: directory }), /checksum mismatch/i);
  assert.doesNotMatch(calls.join('\\n'), /select 1;/);
});
