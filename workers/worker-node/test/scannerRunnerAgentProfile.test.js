import test from 'node:test';
import assert from 'node:assert/strict';
import { toContract } from '../src/scannerRunner.js';

test('bundled scanner contract carries the agent profile security assessment into managed scan output', () => {
  const output = toContract({
    metadata: { script_version: '3.4.0', target_root: '/target' },
    score: { overall_score: 91 },
    executive_summary: ['summary'],
    findings: [],
    agent_profile_assessment: {
      status: 'assessed',
      profile_count: 1,
      profiles: [{ runtime: 'hermes', profile_id: 'operations', status: 'PASS', risk: 'Low' }],
    },
  }, { runId: 'run-1' });

  assert.equal(output.agent_profile_assessment.profile_count, 1);
  assert.equal(output.agent_profile_assessment.profiles[0].profile_id, 'operations');
});
