import { ARTIFACT_KIND, scannerBundleContractVersion } from '@shore-sentinel/shared';
import { artifactUploadPayload } from './lifecycle.js';

export function agentProfileAssessmentFrom(scannerOutput) {
  const assessment = scannerOutput?.agent_profile_assessment ?? scannerOutput?.agentProfileAssessment;
  if (!assessment || typeof assessment !== 'object') {
    return { status: 'not_detected', profile_count: 0, profiles: [] };
  }
  return assessment;
}

export function buildScanArtifactUploads({ runId, scannerOutput, parsed }) {
  const parserVersion = parsed?.parserVersion;
  return [
    artifactUploadPayload({
      runId,
      kind: ARTIFACT_KIND.scannerRawOutput,
      contentType: 'application/json',
      body: scannerOutput,
      metadata: { contractVersion: scannerBundleContractVersion() },
    }),
    artifactUploadPayload({
      runId,
      kind: ARTIFACT_KIND.agentProfileSecurityAssessment,
      contentType: 'application/json',
      body: agentProfileAssessmentFrom(scannerOutput),
      metadata: { contractVersion: scannerBundleContractVersion(), assessmentSource: 'scanner_output' },
    }),
    artifactUploadPayload({
      runId,
      kind: ARTIFACT_KIND.normalizedFindings,
      contentType: 'application/json',
      body: parsed.normalizedFindings,
      metadata: { parserVersion },
    }),
    artifactUploadPayload({
      runId,
      kind: ARTIFACT_KIND.enrichmentSummary,
      contentType: 'application/json',
      body: parsed.enrichmentSummary,
      metadata: { parserVersion },
    }),
  ];
}
