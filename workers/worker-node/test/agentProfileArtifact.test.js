import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND } from '@shore-sentinel/shared';
import { buildScanArtifactUploads } from '../src/scanArtifacts.js';

test('managed scan uploads a dedicated agent profile security assessment artifact', () => {
  const uploads = buildScanArtifactUploads({
    runId: 'run-agent-profiles',
    scannerOutput: {
      findings: [],
      agent_profile_assessment: {
        status: 'assessed',
        profile_count: 1,
        profiles: [{ runtime: 'hermes', profile_id: 'operations', status: 'PASS', risk: 'Low' }],
      },
    },
    parsed: { normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' },
  });

  const artifact = uploads.find((item) => item.kind === ARTIFACT_KIND.agentProfileSecurityAssessment);
  assert.ok(artifact);
  assert.equal(artifact.contentType, 'application/json');
  const body = JSON.parse(Buffer.from(artifact.bodyBase64, 'base64').toString('utf8'));
  assert.equal(body.profile_count, 1);
  assert.equal(body.profiles[0].profile_id, 'operations');
});

test('managed scan records profile discovery as not detected when the scanner does not provide an assessment', () => {
  const uploads = buildScanArtifactUploads({
    runId: 'run-no-profiles',
    scannerOutput: { findings: [] },
    parsed: { normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' },
  });

  const artifact = uploads.find((item) => item.kind === ARTIFACT_KIND.agentProfileSecurityAssessment);
  const body = JSON.parse(Buffer.from(artifact.bodyBase64, 'base64').toString('utf8'));
  assert.deepEqual(body, { status: 'not_detected', profile_count: 0, profiles: [] });
});
