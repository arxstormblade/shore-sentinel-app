import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionSecrets } from '../src/database.service.js';
import { SCHEMA_SQL } from '../src/schema.js';

const fixtureSecret = (label: string) => `fixture-${label}-${'x'.repeat(32)}`;

const productionSecrets = {
  NODE_ENV: 'production',
  SHORE_SENTINEL_SECRET_KEY: fixtureSecret('application'),
  SEED_ADMIN_PASSWORD: fixtureSecret('seed-admin'),
  POSTGRES_PASSWORD: fixtureSecret('postgres'),
  MINIO_ACCESS_KEY: fixtureSecret('minio-access'),
  MINIO_SECRET_KEY: fixtureSecret('minio-secret'),
  INTERNAL_WORKER_TOKEN: fixtureSecret('worker-token'),
};

test('existing scan_runs tables gain every cancellation column idempotently', () => {
  const createRunsIndex = SCHEMA_SQL.indexOf('CREATE TABLE IF NOT EXISTS scan_runs');
  const migrations = [
    'ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz',
    'ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS cancellation_requested_by uuid REFERENCES users(id)',
    'ALTER TABLE scan_runs ADD COLUMN IF NOT EXISTS cancellation_reason text',
  ];

  assert.ok(createRunsIndex >= 0, 'scan_runs table creation should exist');
  for (const migration of migrations) {
    const migrationIndex = SCHEMA_SQL.indexOf(migration);
    assert.ok(migrationIndex > createRunsIndex, `${migration} should run after scan_runs exists`);
  }
});

test('schema provisions all required SSH control tables idempotently', () => {
  for (const table of [
    'ssh_host_key_pins',
    'target_egress_policies',
    'target_root_policies',
    'worker_execution_grants',
  ]) assert.match(SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
});

test('worker execution grant attempt uniqueness is named on fresh tables and catalog-guarded on restart', () => {
  assert.match(SCHEMA_SQL, /CONSTRAINT worker_execution_grants_run_attempt_key UNIQUE\(tenant_id, run_id, action, attempt\)/);
  assert.match(SCHEMA_SQL, /pg_constraint[\s\S]*conrelid='worker_execution_grants'::regclass[\s\S]*conname='worker_execution_grants_run_attempt_key'/);
  assert.match(SCHEMA_SQL, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint[\s\S]*worker_execution_grants_run_attempt_key[\s\S]*ALTER TABLE worker_execution_grants ADD CONSTRAINT worker_execution_grants_run_attempt_key/);
});

test('production startup rejects missing, placeholder, and weak required secrets without exposing values', () => {
  assert.throws(
    () => validateProductionSecrets({ NODE_ENV: 'production' }),
    /SHORE_SENTINEL_SECRET_KEY.*SEED_ADMIN_PASSWORD.*POSTGRES_PASSWORD.*MINIO_ACCESS_KEY.*MINIO_SECRET_KEY.*INTERNAL_WORKER_TOKEN/,
  );

  const placeholder = { ...productionSecrets, MINIO_SECRET_KEY: 'replace-me' };
  assert.throws(() => validateProductionSecrets(placeholder), (error: Error) => {
    assert.match(error.message, /MINIO_SECRET_KEY/);
    assert.doesNotMatch(error.message, /replace-me/);
    return true;
  });

  assert.throws(
    () => validateProductionSecrets({ ...productionSecrets, INTERNAL_WORKER_TOKEN: 'too-short' }),
    /INTERNAL_WORKER_TOKEN/,
  );
});

test('non-production environments remain usable without production secrets', () => {
  assert.doesNotThrow(() => validateProductionSecrets({ NODE_ENV: 'test' }));
  assert.doesNotThrow(() => validateProductionSecrets({}));
  assert.doesNotThrow(() => validateProductionSecrets(productionSecrets));
});
