import test from 'node:test';
import assert from 'node:assert/strict';
import { ARTIFACT_KIND, JOB_STATUS, RUN_EVENT_TYPE } from '@shore-sentinel/shared';
import { artifactUploadPayload, lifecycleEvent, retryDecision } from '../src/lifecycle.js';

test('lifecycle events include required run/job context', () => {
  const event = lifecycleEvent({
    runId: 'run-1',
    jobId: '42',
    type: RUN_EVENT_TYPE.jobClaimed,
    status: JOB_STATUS.claimed,
    attempt: 2,
  });
  assert.equal(event.runId, 'run-1');
  assert.equal(event.jobId, '42');
  assert.equal(event.attempt, 2);
  assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('retry decision schedules retries before max attempts', () => {
  const decision = retryDecision({ attemptsMade: 1, maxAttempts: 3, error: new Error('boom') });
  assert.equal(decision.retry, true);
  assert.equal(decision.status, JOB_STATUS.retrying);
  assert.equal(decision.eventType, RUN_EVENT_TYPE.jobRetryScheduled);
  assert.equal(decision.metadata.error, 'boom');
});

test('retry decision fails permanently at max attempts', () => {
  const decision = retryDecision({ attemptsMade: 2, maxAttempts: 3, error: 'bad input' });
  assert.equal(decision.retry, false);
  assert.equal(decision.status, JOB_STATUS.failed);
  assert.equal(decision.eventType, RUN_EVENT_TYPE.jobFailed);
});

test('artifact upload payload encodes body for API handoff', () => {
  const payload = artifactUploadPayload({
    runId: 'run-1',
    kind: ARTIFACT_KIND.normalizedFindings,
    contentType: 'application/json',
    body: [{ id: 'finding-1' }],
  });
  assert.equal(payload.runId, 'run-1');
  assert.equal(JSON.parse(Buffer.from(payload.bodyBase64, 'base64').toString('utf8'))[0].id, 'finding-1');
});
