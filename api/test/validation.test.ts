import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND } from '@shore-sentinel/shared';
import { assertExactlyOneSubject, validateArtifactComplete } from '../src/validation.js';
import { SCHEMA_SQL } from '../src/schema.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('subject validation accepts canonical one-time audit subject only', () => assert.doesNotThrow(() => assertExactlyOneSubject('one_time_audit', null, 'audit-id')));
test('subject validation accepts canonical managed target subject only', () => assert.doesNotThrow(() => assertExactlyOneSubject('managed_target', 'target-id', null)));
test('subject validation rejects missing, ambiguous, and mismatched subjects', () => {
  assert.throws(() => assertExactlyOneSubject('managed_target', null, null), /Exactly one subject/);
  assert.throws(() => assertExactlyOneSubject('managed_target', 'target-id', 'audit-id'), /Exactly one subject/);
  assert.throws(() => assertExactlyOneSubject('managed_target', null, 'audit-id'), /managed_target/);
});
test('schema contains database-level exactly-one constraints for jobs and runs', () => {
  assert.match(SCHEMA_SQL, /CONSTRAINT scan_jobs_exactly_one_subject CHECK/);
  assert.match(SCHEMA_SQL, /CONSTRAINT scan_runs_exactly_one_subject CHECK/);
  assert.match(SCHEMA_SQL, /owner_user_id uuid REFERENCES users\(id\)/);
  assert.match(SCHEMA_SQL, /due_date date/);
  assert.match(SCHEMA_SQL, /evidence_artifact_id uuid REFERENCES artifacts\(id\)/);
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS remediation_item_comments/);
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS remediation_item_activity/);
});
test('artifact completion validation accepts legacy upload types and canonical worker kinds', () => {
  const ok = validateArtifactComplete({ artifact_type: 'sarif', sha256: 'a'.repeat(64), size_bytes: 25 });
  assert.deepEqual(ok, { artifactType: 'sarif', sha256: 'a'.repeat(64), sizeBytes: 25 });
  const canonical = validateArtifactComplete({ artifact_type: ARTIFACT_KIND.scannerRawOutput, sha256: 'b'.repeat(64), size_bytes: 25 });
  assert.deepEqual(canonical, { artifactType: ARTIFACT_KIND.scannerRawOutput, sha256: 'b'.repeat(64), sizeBytes: 25 });
  assert.throws(() => validateArtifactComplete({ artifact_type: 'exe', sha256: 'a'.repeat(64), size_bytes: 25 }), /artifact_type/);
  assert.throws(() => validateArtifactComplete({ artifact_type: 'json', sha256: 'nope', size_bytes: 25 }), /sha256/);
  assert.throws(() => validateArtifactComplete({ artifact_type: 'json', sha256: 'a'.repeat(64), size_bytes: 0 }), /size_bytes/);
});

test('remediation status-counts route is declared before parameterized remediation id route', () => {
  const source = readFileSync(join(process.cwd(), 'src/app.controller.ts'), 'utf8');
  const statusCountsIndex = source.indexOf("@Get('remediations/status-counts')");
  const idIndex = source.indexOf("@Get('remediations/:id')");
  assert.ok(statusCountsIndex > -1, 'status-counts route missing');
  assert.ok(idIndex > -1, 'remediation id route missing');
  assert.ok(statusCountsIndex < idIndex, 'status-counts must be declared before :id so Nest does not treat status-counts as a UUID id');
});
