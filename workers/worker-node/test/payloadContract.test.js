import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ARTIFACT_KIND } from '@shore-sentinel/shared';
import { processManagedSshJob } from '../src/managedSshProcessor.js';
import { createParserClient } from '../src/parserClient.js';
import { PARSER_REQUEST_MAX_BYTES, SSH_SCANNER_OUTPUT_MAX_BYTES } from '../src/payloadLimits.js';

const job = {
  id: 'payload-contract-job',
  attemptsMade: 0,
  data: { runId: 'run-12345678-1234-1234-1234-123456789012', jobId: 'job-1', targetId: 'target-1' },
};

const grant = {
  grantId: 'grant-1',
  maxAttempts: 3,
  attempt: 1,
  workerCapability: 'capability-1',
};

function scannerJsonWithExactBytes(bytes) {
  const prefix = '{"scanner":{"name":"fixture"},"findings":["';
  const suffix = '"]}';
  const fillerBytes = bytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  assert.ok(fillerBytes >= 0);
  return `${prefix}${'x'.repeat(fillerBytes)}${suffix}`;
}

function apiRecorder(uploads) {
  return {
    getRunControl: async () => ({ cancelled: false }),
    fetchSshGrant: async () => grant,
    emitRunEvent: async () => undefined,
    uploadArtifact: async (payload) => uploads.push(payload),
  };
}

test('accepts the exact SSH scanner-output ceiling through parser request serialization and raw artifact upload', async () => {
  const stdout = scannerJsonWithExactBytes(SSH_SCANNER_OUTPUT_MAX_BYTES);
  const uploads = [];
  const fetchCalls = [];
  const parse = createParserClient({
    pythonWorkerUrl: 'http://parser.invalid',
    internalWorkerToken: 'test-token',
    fetchImpl: async (_url, options) => {
      fetchCalls.push(options);
      return {
        ok: true,
        json: async () => ({ normalizedFindings: [], enrichmentSummary: {}, parserVersion: 'test' }),
      };
    },
  });

  await processManagedSshJob(job, {
    api: apiRecorder(uploads),
    execute: async () => ({ exitCode: 0, stdout, stderr: 'bounded diagnostic text' }),
    parse,
    contractVersion: () => '2026.07.20',
  });

  assert.equal(Buffer.byteLength(stdout), SSH_SCANNER_OUTPUT_MAX_BYTES);
  assert.equal(fetchCalls.length, 1);
  assert.ok(Buffer.byteLength(fetchCalls[0].body) <= PARSER_REQUEST_MAX_BYTES);
  const rawArtifact = uploads.find((payload) => payload.kind === ARTIFACT_KIND.scannerRawOutput);
  assert.equal(Buffer.from(rawArtifact.bodyBase64, 'base64').toString('utf8'), stdout);
  assert.equal(Buffer.byteLength(Buffer.from(rawArtifact.bodyBase64, 'base64')), SSH_SCANNER_OUTPUT_MAX_BYTES);
});

test('rejects a valid scanner JSON one byte beyond the SSH scanner-output ceiling locally before parser fetch', async () => {
  const stdout = scannerJsonWithExactBytes(SSH_SCANNER_OUTPUT_MAX_BYTES + 1);
  let fetchCalls = 0;
  const parse = createParserClient({
    pythonWorkerUrl: 'http://parser.invalid',
    internalWorkerToken: 'test-token',
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('network must not be reached');
    },
  });

  await assert.rejects(
    () => processManagedSshJob({ ...job, id: 'payload-contract-one-byte-over' }, {
      api: apiRecorder([]),
      execute: async () => ({ exitCode: 0, stdout }),
      parse,
      contractVersion: () => '2026.07.20',
    }),
    (error) => {
      assert.match(error.message, /scanner payload exceeds configured byte limit/i);
      assert.equal(error.message.includes(stdout.slice(0, 32)), false);
      return true;
    },
  );
  assert.equal(fetchCalls, 0);
});

test('rejects malformed SSH scanner output locally before parser fetch without returning scanner contents', async () => {
  const malformed = '{"scanner": invalid-json}';
  let fetchCalls = 0;
  const parse = createParserClient({
    pythonWorkerUrl: 'http://parser.invalid',
    internalWorkerToken: 'test-token',
    fetchImpl: async () => { fetchCalls += 1; throw new Error('network must not be reached'); },
  });

  await assert.rejects(
    () => processManagedSshJob({ ...job, id: 'payload-contract-malformed' }, {
      api: apiRecorder([]),
      execute: async () => ({ exitCode: 0, stdout: malformed }),
      parse,
      contractVersion: () => '2026.07.20',
    }),
    (error) => {
      assert.match(error.message, /SSH remote runner returned invalid JSON/i);
      assert.equal(error.message.includes(malformed), false);
      return true;
    },
  );
  assert.equal(fetchCalls, 0);
});

test('rejects a one-byte-over UTF-8 parser request envelope locally before fetch', async () => {
  const scannerOutput = { scanner: { name: 'fixture "quoted" é' }, findings: [] };
  const contractVersion = '2026.07.20';
  const base = JSON.stringify({ runId: '', scannerOutput, contractVersion });
  const runId = `run-${'x'.repeat(PARSER_REQUEST_MAX_BYTES + 1 - Buffer.byteLength(base) - Buffer.byteLength('run-'))}`;
  const serialized = JSON.stringify({ runId, scannerOutput, contractVersion });
  let fetchCalls = 0;
  const parse = createParserClient({
    pythonWorkerUrl: 'http://parser.invalid',
    internalWorkerToken: 'test-token',
    fetchImpl: async () => { fetchCalls += 1; throw new Error('network must not be reached'); },
  });

  assert.equal(Buffer.byteLength(serialized), PARSER_REQUEST_MAX_BYTES + 1);
  await assert.rejects(
    () => parse({ runId, scannerOutput, contractVersion }),
    (error) => {
      assert.match(error.message, /scanner payload exceeds configured byte limit/i);
      assert.equal(error.message.includes('fixture'), false);
      return true;
    },
  );
  assert.equal(fetchCalls, 0);
});

test('uses the parser worker documented one MiB request ceiling as the Node parser request ceiling', async () => {
  assert.equal(PARSER_REQUEST_MAX_BYTES, 1024 * 1024);
  const pythonServer = await readFile(new URL('../../worker-python/src/server.py', import.meta.url), 'utf8');
  const pythonLimit = pythonServer.match(/^MAX_PARSE_BODY_BYTES = (\d+) \* (\d+)$/m);
  assert.ok(pythonLimit);
  assert.equal(Number(pythonLimit[1]) * Number(pythonLimit[2]), PARSER_REQUEST_MAX_BYTES);
});
