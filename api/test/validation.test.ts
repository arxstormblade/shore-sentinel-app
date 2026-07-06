import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND } from '@shore-sentinel/shared';
import { assertExactlyOneSubject, validateArtifactComplete } from '../src/validation.js';
import { SCHEMA_SQL } from '../src/schema.js';

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
