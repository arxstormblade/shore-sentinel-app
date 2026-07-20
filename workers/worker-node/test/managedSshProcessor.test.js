import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { processManagedSshJob, emitManagedSshFailure } from '../src/managedSshProcessor.js';
import { retryDecision } from '../src/lifecycle.js';
import { handleManagedSshFailure } from '../src/failureHandling.js';

const job = { id: 'queue-job-1', attemptsMade: 0, data: { runId: 'run-1', jobId: 'job-1', targetId: 'target-1' } };
const grant = {
  runId: 'run-1', grantId: 'grant-1', attempt: 1, host: '10.20.30.40', port: 22,
  maxAttempts: 3,
  workerCapability: 'opaque-worker-capability',
  hostKeyPin: 'SHA256:pinned-host-key', permittedCidrs: ['10.20.0.0/16'], enrolledRoot: '/srv/shore-sentinel', scanTarget: '.',
  credential: { username: 'scanner', password: 'do-not-log' },
};

test('worker entrypoint supplies configured parser, artifact, and lifecycle budgets to managed SSH processing', async () => {
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /parserTimeoutMs:\s*config\.parserTimeoutMs/);
  assert.match(source, /artifactHandoffTimeoutMs:\s*config\.artifactHandoffTimeoutMs/);
  assert.match(source, /lifecycleEventTimeoutMs:\s*config\.lifecycleEventTimeoutMs/);
  assert.match(source, /handleManagedSshFailure/);
  assert.doesNotMatch(source, /for \(;;\)/);
  assert.doesNotMatch(source, /retryDecision/);
});

test('cancelled execution re-reads control and completes without retrying a stale lifecycle transition', async () => {
  const calls = [];
  const result = await handleManagedSshFailure({
    job,
    error: new Error('active command stopped'),
    api: {
      getRunControl: async () => ({ cancelled: true }),
      emitRunEvent: async () => calls.push('event'),
    },
    maxAttempts: 3,
    lifecycleEventTimeoutMs: 10,
    deliveryAttempts: 2,
    sleep: async () => calls.push('sleep'),
  });
  assert.deepEqual(result, { cancelled: true, delivered: false });
  assert.deepEqual(calls, []);
});

test('non-cancellation lifecycle transport failure has a finite retry budget and leaves BullMQ recovery available', async () => {
  let controlCalls = 0;
  let emitCalls = 0;
  const result = await handleManagedSshFailure({
    job,
    error: new Error('remote SSH command failed'),
    api: {
      getRunControl: async () => { controlCalls += 1; return { cancelled: false }; },
      emitRunEvent: async () => { emitCalls += 1; throw new Error('transport unavailable'); },
    },
    maxAttempts: 3,
    lifecycleEventTimeoutMs: 10,
    deliveryAttempts: 2,
    sleep: async () => undefined,
    failureState: { attempt: 1, workerCapability: 'opaque-worker-capability' },
  });
  assert.deepEqual(result, { cancelled: false, delivered: false });
  assert.equal(controlCalls, 1);
  assert.equal(emitCalls, 2);
});

test('indeterminate run control is timeout-bound and still exhausts finite lifecycle delivery before BullMQ recovery', async () => {
  let controlCalls = 0;
  let emitCalls = 0;
  const result = await handleManagedSshFailure({
    job,
    error: new Error('remote SSH command failed'),
    api: {
      getRunControl: async () => { controlCalls += 1; return new Promise(() => {}); },
      emitRunEvent: async () => { emitCalls += 1; throw new Error('transport unavailable'); },
    },
    lifecycleEventTimeoutMs: 5,
    deliveryAttempts: 2,
    sleep: async () => undefined,
    failureState: { attempt: 1, maxAttempts: 3, workerCapability: 'opaque-worker-capability' },
  });
  assert.deepEqual(result, { cancelled: false, delivered: false });
  assert.equal(controlCalls, 1);
  assert.equal(emitCalls, 2);
});

test('managed SSH worker fetches a one-time grant, runs the pinned transport, and uploads SSH-derived artifacts instead of queued scannerOutput', async () => {
  const events = [];
  const uploads = [];
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async (runId, targetId) => { assert.equal(runId, 'run-1'); assert.equal(targetId, 'target-1'); return grant; },
    emitRunEvent: async (event) => events.push(event),
    uploadArtifact: async (payload) => uploads.push(payload),
  };
  const transport = { stageJson: async () => undefined, run: async () => ({ exitCode: 0, stdout: JSON.stringify({ scanner: { name: 'remote', version: '1' }, findings: [] }) }), close: async () => undefined };
  const parse = async ({ scannerOutput }) => ({ normalizedFindings: [{ id: 'finding-1' }], enrichmentSummary: { total: 1 }, parserVersion: 'test' });

  const result = await processManagedSshJob(job, { api, execute: async (context) => { assert.equal(context.credential.password, 'do-not-log'); return transport.run(); }, parse, contractVersion: () => '1.1.0' });

  assert.deepEqual(result, { artifacts: 3, findings: 1 });
  assert.equal(events.at(-1).type, 'job.succeeded');
  assert.equal(uploads.length, 3);
  const raw = JSON.parse(Buffer.from(uploads[0].bodyBase64, 'base64').toString('utf8'));
  assert.equal(raw.scanner.name, 'remote');
  assert.equal(Object.hasOwn(job.data, 'scannerOutput'), false);
});

test('managed SSH worker suppresses a late success when cancellation becomes active', async () => {
  const events = [];
  let controlChecks = 0;
  const api = {
    getRunControl: async () => ({ cancelled: ++controlChecks >= 3 }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (event) => events.push(event),
    uploadArtifact: async () => undefined,
  };
  let executeCalled = false;

  await assert.rejects(
    () => processManagedSshJob(job, { api, execute: async () => { executeCalled = true; return { exitCode: 0, stdout: '{}' }; }, parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }), contractVersion: () => '1.1.0' }),
    /cancelled/i,
  );
  assert.equal(executeCalled, true);
  assert.equal(events.some((event) => event.type === 'job.succeeded'), false);
});

test('managed SSH worker carries the opaque per-run capability on every event and artifact call', async () => {
  const eventGrantIds = [];
  const artifactGrantIds = [];
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (_event, grantId) => eventGrantIds.push(grantId),
    uploadArtifact: async (_payload, grantId) => artifactGrantIds.push(grantId),
  };

  await processManagedSshJob(job, {
    api,
    execute: async () => ({ exitCode: 0, stdout: '{}' }),
    parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
    contractVersion: () => '1.1.0',
  });

  assert.ok(eventGrantIds.length > 0);
  assert.deepEqual(eventGrantIds, Array(eventGrantIds.length).fill('opaque-worker-capability'));
  assert.deepEqual(artifactGrantIds, ['opaque-worker-capability', 'opaque-worker-capability', 'opaque-worker-capability']);
});

test('managed SSH worker stops later artifact uploads when cancellation is observed between uploads', async () => {
  const uploads = [];
  const events = [];
  let controlChecks = 0;
  const api = {
    getRunControl: async () => ({ cancelled: ++controlChecks >= 7 }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (event) => events.push(event),
    uploadArtifact: async (payload) => uploads.push(payload),
  };

  await assert.rejects(
    () => processManagedSshJob(job, {
      api,
      execute: async () => ({ exitCode: 0, stdout: '{}' }),
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /cancelled/i,
  );

  assert.equal(uploads.length, 1);
  assert.equal(events.some((event) => event.type === 'job.succeeded'), false);
});

test('managed SSH worker aborts an active remote execution when its cancellation monitor observes cancellation', async () => {
  let controlChecks = 0;
  let executeStarted = false;
  const api = {
    getRunControl: async () => ({ cancelled: ++controlChecks >= 3 }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async () => undefined,
    uploadArtifact: async () => undefined,
  };

  await assert.rejects(
    () => processManagedSshJob(job, {
      api,
      execute: async (_context, { signal }) => new Promise((resolve, reject) => {
        executeStarted = true;
        signal.addEventListener('abort', () => reject(new Error('active command stopped')), { once: true });
      }),
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
      cancellationPollMs: 1,
    }),
    /active command stopped/i,
  );

  assert.equal(executeStarted, true);
});

test('managed SSH execution failure emits its retry lifecycle event with the fetched opaque worker capability', async () => {
  const emitted = [];
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };

  await assert.rejects(
    () => processManagedSshJob(job, {
      api,
      execute: async () => { throw new Error('remote SSH command failed'); },
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /remote SSH command failed/i,
  );

  await emitManagedSshFailure(job, api, retryDecision({
    attemptsMade: job.attemptsMade,
    maxAttempts: 3,
    error: new Error('remote SSH command failed'),
  }));

  const [failureEvent, failureCapability] = emitted.at(-1);
  assert.equal(failureEvent.type, 'job.retry_scheduled');
  assert.equal(failureEvent.status, 'retrying');
  assert.equal(failureCapability, 'opaque-worker-capability');
  assert.equal(emitted.at(-1).length, 2);
});

test('managed SSH lifecycle terminal decision uses the persisted grant retry limit in the BullMQ failed callback', async () => {
  const emitted = [];
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => ({ ...grant, maxAttempts: 1 }),
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };
  const attemptJob = { ...job, id: 'queue-job-grant-retry-policy' };
  const failure = await assert.rejects(
    () => processManagedSshJob(attemptJob, {
      api,
      execute: async () => { throw new Error('terminal first failure'); },
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /terminal first failure/,
  );
  // BullMQ increments this after the execution has thrown. The callback has no
  // local retry-policy argument, so it must preserve the grant's maxAttempts.
  attemptJob.attemptsMade = 1;
  await emitManagedSshFailure(attemptJob, api, { error: failure });
  assert.equal(emitted.at(-1)[0].type, 'job.failed');
  assert.equal(emitted.at(-1)[0].attempt, 1);
});

test('managed SSH retains its consumed-grant capability across a pre-claim control failure until retry is submitted', async () => {
  const emitted = [];
  let controlChecks = 0;
  const preClaimJob = { ...job, id: 'queue-job-pre-claim-control-failure' };
  const api = {
    getRunControl: async () => {
      controlChecks += 1;
      if (controlChecks === 2) throw new Error('run control unavailable');
      return { cancelled: false };
    },
    fetchSshGrant: async () => grant,
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };

  await assert.rejects(
    () => processManagedSshJob(preClaimJob, {
      api,
      execute: async () => ({ exitCode: 0, stdout: '{}' }),
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /run control unavailable/i,
  );
  assert.equal(emitted.some(([event]) => event.type === 'job.claimed'), false);

  const retrySubmitted = await emitManagedSshFailure(preClaimJob, api, retryDecision({
    attemptsMade: preClaimJob.attemptsMade,
    maxAttempts: 3,
    error: new Error('run control unavailable'),
  }));
  assert.equal(retrySubmitted, true);
  assert.equal(emitted.at(-1)[0].type, 'job.retry_scheduled');
  assert.equal(emitted.at(-1)[1], 'opaque-worker-capability');
  assert.equal(await emitManagedSshFailure(preClaimJob, api, retryDecision({ attemptsMade: 0, maxAttempts: 3, error: new Error('duplicate failure') })), false);
});

test('managed SSH retry acquires a distinct attempt-scoped grant after the first attempt fails', async () => {
  const requestedAttempts = [];
  const emitted = [];
  const grants = {
    1: { ...grant, attempt: 1, grantId: 'grant-attempt-1', workerCapability: 'capability-attempt-1' },
    2: { ...grant, attempt: 2, grantId: 'grant-attempt-2', workerCapability: 'capability-attempt-2' },
  };
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async (_runId, _targetId, attempt) => {
      requestedAttempts.push(attempt);
      return grants[attempt ?? 1];
    },
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };

  const firstAttemptJob = { ...job, id: 'queue-job-distinct-attempt', attemptsMade: 0 };
  const firstFailure = await assert.rejects(
    () => processManagedSshJob(firstAttemptJob, {
      api,
      execute: async () => { throw new Error('first SSH attempt failed'); },
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /first SSH attempt failed/,
  );
  await emitManagedSshFailure(firstAttemptJob, api, { maxAttempts: 3, error: firstFailure });

  const second = await processManagedSshJob({ ...job, attemptsMade: 1 }, {
    api,
    execute: async (secondGrant) => {
      assert.equal(secondGrant.grantId, 'grant-attempt-2');
      return { exitCode: 0, stdout: '{}' };
    },
    parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
    contractVersion: () => '1.1.0',
  });

  assert.deepEqual(second, { artifacts: 3, findings: 0 });
  assert.deepEqual(requestedAttempts, [1, 2]);
  assert.equal(emitted.find(([event]) => event.type === 'job.retry_scheduled')?.[1], 'capability-attempt-1');
});

test('managed SSH failure before capability acquisition remains rejected without submitting a lifecycle transition', async () => {
  const emitted = [];
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => ({ grantId: 'grant-without-capability' }),
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };

  await assert.rejects(
    () => processManagedSshJob({ ...job, id: 'queue-job-without-capability' }, {
      api,
      execute: async () => ({ exitCode: 0, stdout: '{}' }),
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /missing attempt-scoped capability identifier/i,
  );

  const emittedFailure = await emitManagedSshFailure(
    { ...job, id: 'queue-job-without-capability' },
    api,
    retryDecision({ attemptsMade: 0, maxAttempts: 3, error: new Error('grant failed') }),
  );

  assert.equal(emittedFailure, false);
  assert.equal(emitted.length, 0);
});

test('managed SSH failure reports the consumed grant attempt when BullMQ has already incremented attemptsMade', async () => {
  const emitted = [];
  const firstAttemptJob = { ...job, id: 'queue-job-real-bull-failed-counter', attemptsMade: 0 };
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (...args) => emitted.push(args),
    uploadArtifact: async () => undefined,
  };

  const failedAttempt = await assert.rejects(
    () => processManagedSshJob(firstAttemptJob, {
      api,
      execute: async () => { throw new Error('first attempt failed'); },
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /first attempt failed/,
  );

  // BullMQ's failed event observes attemptsMade=1 after the first actual execution.
  const submitted = await emitManagedSshFailure(firstAttemptJob, api, { maxAttempts: 2, error: failedAttempt });

  assert.equal(submitted, true);
  const [event, capability] = emitted.at(-1);
  assert.equal(event.attempt, 1);
  assert.equal(event.type, 'job.retry_scheduled');
  assert.equal(capability, 'opaque-worker-capability');
});

test('managed SSH retries the same consumed attempt lifecycle event after transport failure before clearing job-local state', async () => {
  const emitted = [];
  let transportAttempts = 0;
  const firstAttemptJob = { ...job, id: 'queue-job-failure-event-transport-retry', attemptsMade: 0 };
  const api = {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async (...args) => {
      emitted.push(args);
      if (args[0].type === 'job.retry_scheduled') {
        transportAttempts += 1;
        if (transportAttempts === 1) throw new Error('lifecycle transport unavailable');
      }
    },
    uploadArtifact: async () => undefined,
  };

  const failedAttempt = await assert.rejects(
    () => processManagedSshJob(firstAttemptJob, {
      api,
      execute: async () => { throw new Error('remote SSH command failed'); },
      parse: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      contractVersion: () => '1.1.0',
    }),
    /remote SSH command failed/,
  );

  await assert.rejects(
    () => emitManagedSshFailure(firstAttemptJob, api, { maxAttempts: 2, error: failedAttempt }),
    /lifecycle transport unavailable/,
  );
  assert.equal(await emitManagedSshFailure(firstAttemptJob, api, { maxAttempts: 2, error: failedAttempt }), true);
  assert.deepEqual(emitted.filter(([event]) => event.type === 'job.retry_scheduled').map(([event]) => ({ attempt: event.attempt, type: event.type })), [
    { attempt: 1, type: 'job.retry_scheduled' },
    { attempt: 1, type: 'job.retry_scheduled' },
  ]);
  assert.equal(await emitManagedSshFailure(firstAttemptJob, api, { maxAttempts: 2, error: new Error('duplicate failure') }), false);
});
