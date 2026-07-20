import { Client } from 'ssh2';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
import { isAbsolute, join, normalize, relative } from 'node:path/posix';
import { SSH_SCANNER_OUTPUT_MAX_BYTES, SSH_STDERR_MAX_BYTES } from './payloadLimits.js';

const FORBIDDEN_QUEUE_FIELDS = new Set([
  'scanTarget', 'scan_target', 'scannerOutput', 'command', 'credential', 'executionContext',
]);

const FIXED_REMOTE_RUNNER = '/usr/local/lib/shore-sentinel/run-scan';
const REQUEST_DIRECTORY = '/var/lib/shore-sentinel/requests';
const REMOTE_CANCELLATION_BUDGET_MS = 10_000;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMOTE_CANCELLATION_STATUSES = new Set(['CANCELLED', 'NOT_RUNNING', 'COMPLETED']);
export const DEFAULT_REMOTE_REQUEST_MAX_BYTES = 8192;
export const DEFAULT_REMOTE_OUTPUT_MAX_BYTES = SSH_SCANNER_OUTPUT_MAX_BYTES;
export const DEFAULT_REMOTE_STDERR_MAX_BYTES = SSH_STDERR_MAX_BYTES;

export class SshCancellationError extends Error {
  constructor() {
    super('SSH execution cancelled');
    this.name = 'SshCancellationError';
    this.code = 'SSH_EXECUTION_CANCELLED';
  }
}

function requireRequestId(requestId) {
  if (typeof requestId !== 'string' || !REQUEST_ID_PATTERN.test(requestId)) throw new Error('invalid SSH request identifier');
  return requestId;
}

function fixedRemoteRequestCommand(requestId) {
  return `${FIXED_REMOTE_RUNNER} --request ${requireRequestId(requestId)}`;
}

function fixedRemoteCancellationCommand(requestId) {
  return `${FIXED_REMOTE_RUNNER} --cancel-request ${requireRequestId(requestId)}`;
}

function fixedRemoteStageCommand(requestId) {
  return `${FIXED_REMOTE_RUNNER} --stage-request ${requireRequestId(requestId)}`;
}

function requestIdForFixedStagingPath(path) {
  if (typeof path !== 'string') throw new Error('invalid SSH request staging path');
  const match = new RegExp(`^${REQUEST_DIRECTORY}/(${REQUEST_ID_PATTERN.source.slice(1, -1)})/request\\.json$`, 'i').exec(path);
  if (!match) throw new Error('invalid SSH request staging path');
  return requireRequestId(match[1]);
}

function stageFixedJson(client, requestId, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        client.end();
        reject(error);
      } else resolve();
    };
    const timer = setTimeout(() => finish(new Error('SSH remote request staging timed out')), timeoutMs);
    client.exec(fixedRemoteStageCommand(requestId), (error, stream) => {
      if (error) { finish(new Error('SSH remote request staging unavailable')); return; }
      stream.once('error', () => finish(new Error('SSH remote request staging unavailable')));
      stream.once('close', (exitCode) => {
        if (exitCode === 0) finish();
        else finish(new Error('SSH remote request staging rejected'));
      });
      try {
        stream.end(payload);
      } catch {
        finish(new Error('SSH remote request staging unavailable'));
      }
    });
  });
}

function runFixedCancellationCommand(client, requestId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('SSH remote cancellation timed out')), timeoutMs);
    client.exec(fixedRemoteCancellationCommand(requestId), (error, stream) => {
      if (error) { finish(new Error('SSH remote cancellation unavailable')); return; }
      stream.on('data', (chunk) => {
        if (settled) return;
        stdout += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        if (Buffer.byteLength(stdout) > 64) finish(new Error('SSH remote cancellation unavailable'));
      });
      stream.once('close', (exitCode) => {
        const status = stdout.trim();
        if (exitCode === 0 && REMOTE_CANCELLATION_STATUSES.has(status)) finish(null, { status });
        else finish(new Error('SSH remote cancellation unavailable'));
      });
    });
  });
}

function boundedRemoteCancellation(transport, requestId) {
  if (typeof transport.cancel !== 'function') return Promise.reject(new Error('SSH remote cancellation unavailable'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('SSH remote cancellation timed out')), REMOTE_CANCELLATION_BUDGET_MS);
    Promise.resolve(transport.cancel(requestId, { timeoutMs: REMOTE_CANCELLATION_BUDGET_MS })).then(
      (result) => finish(null, result),
      () => finish(new Error('SSH remote cancellation unavailable')),
    );
  });
}

export function normalizeSshJob(data) {
  if (!data || typeof data !== 'object') throw new Error('SSH queue payload must contain opaque identifiers only');
  for (const field of FORBIDDEN_QUEUE_FIELDS) {
    if (Object.hasOwn(data, field)) throw new Error('SSH queue payload must contain opaque identifiers only');
  }
  const runId = data.runId ?? data.run_id;
  const jobId = data.jobId ?? data.job_id ?? data.id;
  const targetId = data.targetId ?? data.target_id;
  if (![runId, jobId, targetId].every((value) => typeof value === 'string' && value.length > 0)) {
    throw new Error('SSH queue payload must contain opaque identifiers only');
  }
  return { runId, jobId, targetId };
}

function requireContext(context) {
  if (!context || typeof context !== 'object') throw new Error('SSH execution context is required');
  for (const field of ['host', 'hostKeyPin', 'enrolledRoot', 'scanTarget']) {
    if (typeof context[field] !== 'string' || context[field].length === 0) throw new Error(`SSH execution context missing ${field}`);
  }
  if (!Number.isInteger(context.port) || context.port < 1 || context.port > 65535) throw new Error('SSH execution context missing valid port');
  if (!Array.isArray(context.permittedCidrs) || context.permittedCidrs.length === 0) throw new Error('SSH execution context missing permitted CIDR policy');
  if (!context.credential || typeof context.credential !== 'object' || typeof context.credential.username !== 'string' || (!context.credential.password && !context.credential.privateKey)) {
    throw new Error('SSH execution context missing credential grant');
  }
}

function ipv4ToUint32(address) {
  if (!isIPv4(address)) return null;
  const octets = address.split('.').map(Number);
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function parsePermittedCidr(cidr) {
  if (typeof cidr !== 'string') throw new Error('SSH execution context has invalid permitted CIDR policy');
  const [network, prefixText, ...rest] = cidr.split('/');
  if (rest.length !== 0 || !/^\d+$/.test(prefixText ?? '')) throw new Error('SSH execution context has invalid permitted CIDR policy');
  const prefix = Number(prefixText);
  const networkValue = ipv4ToUint32(network);
  if (networkValue === null || prefix < 0 || prefix > 32) throw new Error('SSH execution context has invalid permitted CIDR policy');
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: networkValue & mask, mask };
}

function permittedIpv4Address(address, permittedCidrs) {
  const value = ipv4ToUint32(address);
  if (value === null) return false;
  return permittedCidrs.map(parsePermittedCidr).some(({ network, mask }) => (value & mask) === network);
}

async function resolvePermittedIpv4(host, permittedCidrs, lookup) {
  let result;
  try {
    result = await lookup(host, { family: 4, verbatim: true });
  } catch {
    throw new Error('SSH target host resolution failed');
  }
  const address = result?.address;
  if (result?.family !== 4 || !isIPv4(address) || !permittedIpv4Address(address, permittedCidrs)) {
    throw new Error('SSH target resolved to an address outside the permitted CIDR policy');
  }
  return address;
}

function normalizeScanScope({ enrolledRoot, scanTarget }) {
  if (!isAbsolute(enrolledRoot)) throw new Error('SSH execution context enrolled root must be absolute');
  const normalizedRoot = normalize(enrolledRoot);
  const normalizedTarget = isAbsolute(scanTarget)
    ? normalize(scanTarget)
    : normalize(join(normalizedRoot, scanTarget));
  const targetRelativeToRoot = relative(normalizedRoot, normalizedTarget);
  if (targetRelativeToRoot === '..' || targetRelativeToRoot.startsWith('../') || isAbsolute(targetRelativeToRoot)) {
    throw new Error('SSH scan target is outside enrolled root');
  }
  return { enrolledRoot: normalizedRoot, scanTarget: normalizedTarget };
}

function pinnedHostVerifier(expectedFingerprint) {
  const expected = Buffer.from(expectedFingerprint, 'utf8');
  return (hostKey) => {
    const actual = Buffer.from(`SHA256:${createHash('sha256').update(hostKey).digest('base64')}`, 'utf8');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
}

export async function createPinnedSshTransport(context, { ClientCtor = Client, lookup = dnsLookup, timeoutMs = 120000, maxRequestBytes = DEFAULT_REMOTE_REQUEST_MAX_BYTES, maxOutputBytes = DEFAULT_REMOTE_OUTPUT_MAX_BYTES, maxStderrBytes = DEFAULT_REMOTE_STDERR_MAX_BYTES, signal } = {}) {
  requireContext(context);
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > DEFAULT_REMOTE_REQUEST_MAX_BYTES) {
    throw new Error(`SSH remote request byte limit must be a positive integer no greater than ${DEFAULT_REMOTE_REQUEST_MAX_BYTES}`);
  }
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error('SSH remote output byte limit must be a positive integer');
  if (!Number.isSafeInteger(maxStderrBytes) || maxStderrBytes < 1) throw new Error('SSH remote stderr byte limit must be a positive integer');
  const resolvedHost = await resolvePermittedIpv4(context.host, context.permittedCidrs, lookup);
  if (signal?.aborted) throw new Error('SSH connection aborted');
  const client = new ClientCtor();
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) { client.end(); reject(error); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error('SSH connection timed out')), timeoutMs);
    const abort = () => finish(new Error('SSH connection aborted'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    client.once('ready', () => finish());
    client.once('error', (error) => finish(error));
    client.connect({
      host: resolvedHost,
      port: context.port,
      username: context.credential.username,
      password: context.credential.password,
      privateKey: context.credential.privateKey,
      hostVerifier: pinnedHostVerifier(context.hostKeyPin),
      readyTimeout: timeoutMs,
      keepaliveInterval: Math.min(timeoutMs, 30000),
      keepaliveCountMax: 2,
    });
  });
  return {
    async stageJson(path, value) {
      const requestId = requestIdForFixedStagingPath(path);
      const data = Buffer.from(JSON.stringify(value), 'utf8');
      if (data.byteLength > maxRequestBytes) throw new Error('SSH remote request byte limit exceeded');
      await stageFixedJson(client, requestId, data, timeoutMs);
    },
    run(command, { signal: runSignal } = {}) {
      return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let settled = false;
        const stdoutDecoder = new TextDecoder('utf-8', { fatal: true });
        const stderrDecoder = new TextDecoder('utf-8', { fatal: true });
        const timer = setTimeout(() => finish(new Error('SSH remote runner timed out')), timeoutMs);
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          runSignal?.removeEventListener('abort', abort);
          if (error) {
            client.end();
            reject(error);
          } else {
            resolve(result);
          }
        };
        const abort = () => finish(new Error('SSH remote runner aborted'));
        if (runSignal?.aborted) { abort(); return; }
        runSignal?.addEventListener('abort', abort, { once: true });
        const append = (streamName, chunk) => {
          if (settled) return;
          const bytes = Buffer.byteLength(chunk);
          if (streamName === 'stdout') stdoutBytes += bytes;
          else stderrBytes += bytes;
          const byteLimit = streamName === 'stdout' ? maxOutputBytes : maxStderrBytes;
          if ((streamName === 'stdout' ? stdoutBytes : stderrBytes) > byteLimit) {
            finish(new Error(`SSH remote ${streamName} exceeded configured byte limit`));
            return;
          }
          let text;
          try {
            if (typeof chunk === 'string') text = chunk;
            else if (Buffer.isBuffer(chunk)) text = (streamName === 'stdout' ? stdoutDecoder : stderrDecoder).decode(chunk, { stream: true });
            else throw new TypeError('non-buffer output');
          } catch {
            finish(new Error(`SSH remote ${streamName} contained invalid UTF-8`));
            return;
          }
          if (streamName === 'stdout') stdout += text;
          else stderr += text;
        };
        client.exec(command, (error, stream) => {
          if (error) { finish(error); return; }
          stream.on('data', (chunk) => append('stdout', chunk));
          stream.stderr.on('data', (chunk) => append('stderr', chunk));
          stream.once('close', (exitCode) => {
            if (exitCode !== 0) finish(new Error(`SSH remote runner exited with ${exitCode}`));
            else {
              try {
                stdout += stdoutDecoder.decode();
                stderr += stderrDecoder.decode();
              } catch {
                finish(new Error('SSH remote stdout contained invalid UTF-8'));
                return;
              }
              finish(null, { exitCode, stdout, stderr });
            }
          });
        });
      });
    },
    cancel(requestId, { timeoutMs: cancelTimeoutMs = REMOTE_CANCELLATION_BUDGET_MS } = {}) {
      requireRequestId(requestId);
      if (!Number.isSafeInteger(cancelTimeoutMs) || cancelTimeoutMs < 1 || cancelTimeoutMs > REMOTE_CANCELLATION_BUDGET_MS) {
        throw new Error('SSH remote cancellation budget is invalid');
      }
      return runFixedCancellationCommand(client, requestId, cancelTimeoutMs);
    },
    close: async () => { client.end(); },
  };
}

export async function executePinnedScan(context, { transport, requestId = randomUUID(), timeoutMs, maxOutputBytes, ClientCtor, signal } = {}) {
  requireContext(context);
  requireRequestId(requestId);
  if (signal?.aborted) throw new SshCancellationError();
  const scope = normalizeScanScope(context);
  const requestPath = `${REQUEST_DIRECTORY}/${requestId}/request.json`;
  const activeTransport = transport ?? await createPinnedSshTransport(context, { timeoutMs, maxOutputBytes, ClientCtor, signal });
  if (!activeTransport || typeof activeTransport.stageJson !== 'function' || typeof activeTransport.run !== 'function' || typeof activeTransport.close !== 'function') throw new Error('SSH transport is required');
  let abort;
  try {
    await activeTransport.stageJson(requestPath, scope);
    if (signal?.aborted) throw new SshCancellationError();
    const execution = activeTransport.run(fixedRemoteRequestCommand(requestId));
    if (!signal) return await execution;
    const cancellation = new Promise((_, reject) => {
      abort = () => {
        boundedRemoteCancellation(activeTransport, requestId).then(
          () => reject(new SshCancellationError()),
          () => reject(new SshCancellationError()),
        );
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
    return await Promise.race([execution, cancellation]);
  } finally {
    if (abort) signal?.removeEventListener('abort', abort);
    await activeTransport.close();
  }
}

export { FIXED_REMOTE_RUNNER };
