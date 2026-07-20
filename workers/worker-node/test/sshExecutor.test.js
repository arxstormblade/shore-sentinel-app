import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPinnedSshTransport, executePinnedScan, normalizeSshJob } from '../src/sshExecutor.js';
import { SSH_SCANNER_OUTPUT_MAX_BYTES } from '../src/payloadLimits.js';

class ReadyClient extends EventEmitter {
  static instances = [];
  static events = [];

  constructor() {
    super();
    this.connectCalls = [];
    ReadyClient.instances.push(this);
  }

  connect(options) {
    this.connectCalls.push(options);
    ReadyClient.events.push('connect');
    queueMicrotask(() => this.emit('ready'));
  }

  end() {}
}

function sshContext(overrides = {}) {
  return {
    host: 'scanner.internal.example',
    port: 22,
    hostKeyPin: 'SHA256:pin',
    permittedCidrs: ['10.10.0.0/16'],
    enrolledRoot: '/srv/shore-sentinel',
    scanTarget: '.',
    credential: { username: 'scanner', password: 'not-logged' },
    ...overrides,
  };
}

test('SSH worker rejects queue payloads that carry scan scope or execution material', () => {
  assert.deepEqual(normalizeSshJob({ runId: 'run-1', jobId: 'job-1', targetId: 'target-1' }), {
    runId: 'run-1',
    jobId: 'job-1',
    targetId: 'target-1',
  });
  for (const forbidden of ['scanTarget', 'scan_target', 'scannerOutput', 'command', 'credential', 'executionContext']) {
    assert.throws(
      () => normalizeSshJob({ runId: 'run-1', jobId: 'job-1', targetId: 'target-1', [forbidden]: 'untrusted' }),
      /opaque identifiers only/i,
      `${forbidden} must never enter a queue payload`,
    );
  }
});

test('SSH transport resolves immediately and connects only to the permitted resolved IPv4 address', async () => {
  ReadyClient.instances = [];
  ReadyClient.events = [];
  const lookupCalls = [];
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: ReadyClient,
    lookup: async (host, options) => {
      ReadyClient.events.push('lookup');
      lookupCalls.push({ host, options });
      return { address: '10.10.20.4', family: 4 };
    },
  });

  assert.deepEqual(lookupCalls, [{ host: 'scanner.internal.example', options: { family: 4, verbatim: true } }]);
  assert.deepEqual(ReadyClient.events, ['lookup', 'connect']);
  assert.equal(ReadyClient.instances[0].connectCalls.length, 1);
  assert.equal(ReadyClient.instances[0].connectCalls[0].host, '10.10.20.4');
  await transport.close();
});

test('SSH transport rejects an IPv4 resolution outside permitted CIDRs before opening a connection', async () => {
  ReadyClient.instances = [];
  await assert.rejects(
    () => createPinnedSshTransport(sshContext(), {
      ClientCtor: ReadyClient,
      lookup: async () => ({ address: '10.11.20.4', family: 4 }),
    }),
    /outside the permitted CIDR policy/i,
  );
  assert.equal(ReadyClient.instances.length, 0);
});

test('SSH transport rejects a staging ceiling above the fixed 8192-byte protocol maximum before DNS or connection', async () => {
  ReadyClient.instances = [];
  let lookupCalled = false;

  await assert.rejects(
    () => createPinnedSshTransport(sshContext(), {
      ClientCtor: ReadyClient,
      lookup: async () => {
        lookupCalled = true;
        return { address: '10.10.20.4', family: 4 };
      },
      maxRequestBytes: 8193,
    }),
    /request byte limit.*8192|8192.*request byte limit/i,
  );

  assert.equal(lookupCalled, false);
  assert.equal(ReadyClient.instances.length, 0);
});

test('SSH executor stages scope as JSON and never interpolates it into remote shell text', async () => {
  const staged = [];
  const commands = [];
  const context = {
    host: '10.10.20.4',
    port: 22,
    hostKeyPin: 'SHA256:pin',
    permittedCidrs: ['10.10.0.0/16'],
    enrolledRoot: '/srv/shore-sentinel',
    scanTarget: '.',
    credential: { username: 'scanner', password: 'not-logged' },
  };
  const transport = {
    stageJson: async (path, value) => staged.push({ path, value }),
    run: async (command) => { commands.push(command); return { exitCode: 0 }; },
    close: async () => undefined,
  };

  await executePinnedScan(context, { transport, requestId: '123e4567-e89b-12d3-a456-426614174000' });

  assert.equal(commands.length, 1);
  assert.equal(commands[0], '/usr/local/lib/shore-sentinel/run-scan --request 123e4567-e89b-12d3-a456-426614174000');
  assert.equal(commands[0].includes('/srv/shore-sentinel'), false);
  assert.deepEqual(staged, [{
    path: '/var/lib/shore-sentinel/requests/123e4567-e89b-12d3-a456-426614174000/request.json',
    value: { enrolledRoot: '/srv/shore-sentinel', scanTarget: '/srv/shore-sentinel' },
  }]);
});

test('SSH executor rejects an absolute scan target outside the enrolled root before staging', async () => {
  const staged = [];
  const transport = {
    stageJson: async (path, value) => staged.push({ path, value }),
    run: async () => ({ exitCode: 0 }),
    close: async () => undefined,
  };

  await assert.rejects(
    () => executePinnedScan(sshContext({ scanTarget: '/var/tmp/outside-enrollment' }), {
      transport,
      requestId: '123e4567-e89b-12d3-a456-426614174000',
    }),
    /outside enrolled root/i,
  );
  assert.deepEqual(staged, []);
});

class CommandClient extends EventEmitter {
  static latest;

  constructor() {
    super();
    this.endCalls = 0;
    CommandClient.latest = this;
  }

  connect() { queueMicrotask(() => this.emit('ready')); }
  end() { this.endCalls += 1; }
  exec(_command, callback) {
    this.stream = new EventEmitter();
    this.stream.stderr = new EventEmitter();
    callback(null, this.stream);
  }
}

class StageClient extends EventEmitter {
  static latest;

  constructor() {
    super();
    this.commands = [];
    this.sftpCalls = 0;
    this.endCalls = 0;
    StageClient.latest = this;
  }

  connect() { queueMicrotask(() => this.emit('ready')); }
  end() { this.endCalls += 1; }
  sftp(callback) { this.sftpCalls += 1; callback(new Error('SFTP must not be requested')); }
  exec(command, callback) {
    this.commands.push(command);
    const stream = new EventEmitter();
    stream.stderr = new EventEmitter();
    stream.end = (payload) => {
      this.stagedPayload = Buffer.from(payload);
      queueMicrotask(() => stream.emit('close', 0));
    };
    callback(null, stream);
  }
}

test('SSH staging uses only the fixed UUID stage action and streams the exact bounded JSON payload without SFTP', async () => {
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: StageClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    maxRequestBytes: 128,
  });
  const requestId = '123e4567-e89b-12d3-a456-426614174000';
  const payload = { enrolledRoot: '/srv/shore-sentinel', scanTarget: '/srv/shore-sentinel' };

  await transport.stageJson(`/var/lib/shore-sentinel/requests/${requestId}/request.json`, payload);

  assert.deepEqual(StageClient.latest.commands, [
    '/usr/local/lib/shore-sentinel/run-scan --stage-request 123e4567-e89b-12d3-a456-426614174000',
  ]);
  assert.deepEqual(StageClient.latest.stagedPayload, Buffer.from(JSON.stringify(payload), 'utf8'));
  assert.equal(StageClient.latest.sftpCalls, 0);
  await transport.close();
});

test('SSH staging rejects an arbitrary path, non-UUID path, and oversized payload before opening an exec stream', async () => {
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: StageClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    maxRequestBytes: 8,
  });
  const validPath = '/var/lib/shore-sentinel/requests/123e4567-e89b-12d3-a456-426614174000/request.json';

  await assert.rejects(() => transport.stageJson('/tmp/request.json', {}), /invalid SSH request staging path/i);
  await assert.rejects(() => transport.stageJson('/var/lib/shore-sentinel/requests/not-a-uuid/request.json', {}), /invalid SSH request staging path/i);
  await assert.rejects(() => transport.stageJson(validPath, { value: 'over-limit' }), /request byte limit/i);
  assert.deepEqual(StageClient.latest.commands, []);
  assert.equal(StageClient.latest.sftpCalls, 0);
  await transport.close();
});

function scannerJsonWithExactBytes(bytes) {
  const prefix = '{"scanner":{"name":"fixture"},"findings":["';
  const suffix = '"]}';
  return `${prefix}${'x'.repeat(bytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix))}${suffix}`;
}

test('SSH collection accepts the exact scanner payload ceiling and rejects one byte over it', async () => {
  const exact = scannerJsonWithExactBytes(SSH_SCANNER_OUTPUT_MAX_BYTES);
  const acceptedTransport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    timeoutMs: 100,
  });
  const accepted = acceptedTransport.run('/fixed/runner');
  CommandClient.latest.stream.emit('data', Buffer.from(exact, 'utf8'));
  CommandClient.latest.stream.emit('close', 0);
  assert.equal((await accepted).stdout, exact);

  const rejectedTransport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    timeoutMs: 100,
  });
  const rejected = rejectedTransport.run('/fixed/runner');
  CommandClient.latest.stream.emit('data', Buffer.from(scannerJsonWithExactBytes(SSH_SCANNER_OUTPUT_MAX_BYTES + 1), 'utf8'));
  await assert.rejects(rejected, /remote stdout exceeded configured byte limit/i);
});

test('SSH collection bounds stderr independently without changing the stdout parser payload budget', async () => {
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    maxOutputBytes: 2,
    maxStderrBytes: 5,
    timeoutMs: 100,
  });
  const running = transport.run('/fixed/runner');
  CommandClient.latest.stream.emit('data', Buffer.from('{}'));
  CommandClient.latest.stream.stderr.emit('data', Buffer.from('warn!'));
  CommandClient.latest.stream.emit('close', 0);

  assert.deepEqual(await running, { exitCode: 0, stdout: '{}', stderr: 'warn!' });
});

test('SSH transport rejects remote stdout beyond its explicit byte limit before accumulating it', async () => {
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    maxOutputBytes: 4,
  });

  const running = transport.run('/fixed/runner');
  CommandClient.latest.stream.emit('data', Buffer.from('abcde', 'utf8'));

  await assert.rejects(running, /remote stdout exceeded configured byte limit/i);
  assert.equal(CommandClient.latest.endCalls, 1);
});

test('SSH transport rejects malformed remote UTF-8 without retaining its body', async () => {
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
  });

  const running = transport.run('/fixed/runner');
  CommandClient.latest.stream.emit('data', Buffer.from([0xc3]));
  CommandClient.latest.stream.emit('close', 0);

  await assert.rejects(running, /remote stdout contained invalid UTF-8/i);
  assert.equal(CommandClient.latest.endCalls, 1);
});

test('SSH transport uses its AbortSignal for connection setup only, not local active-command termination', async () => {
  const controller = new AbortController();
  const transport = await createPinnedSshTransport(sshContext(), {
    ClientCtor: CommandClient,
    lookup: async () => ({ address: '10.10.20.4', family: 4 }),
    signal: controller.signal,
    timeoutMs: 100,
  });

  const running = transport.run('/fixed/runner');
  controller.abort();

  assert.equal(CommandClient.latest.endCalls, 0);
  CommandClient.latest.stream.emit('data', Buffer.from('{}'));
  CommandClient.latest.stream.emit('close', 0);
  assert.deepEqual(await running, { exitCode: 0, stdout: '{}', stderr: '' });
});

test('SSH executor does not turn AbortSignal into local command termination', async () => {
  const controller = new AbortController();
  let runOptions;
  const transport = {
    stageJson: async () => undefined,
    run: async (_command, options) => { runOptions = options; return { exitCode: 0 }; },
    close: async () => undefined,
  };

  await executePinnedScan(sshContext(), {
    transport,
    signal: controller.signal,
    requestId: '123e4567-e89b-12d3-a456-426614174000',
  });

  assert.equal(runOptions, undefined);
});

test('SSH executor sends only the fixed UUID cancellation action before closing an aborted transport', async () => {
  const controller = new AbortController();
  const commands = [];
  const cancelled = [];
  let closed = false;
  const transport = {
    stageJson: async () => undefined,
    run: async (command) => {
      commands.push(command);
      return new Promise(() => {});
    },
    cancel: async (requestId, options) => {
      cancelled.push({ requestId, options });
      assert.equal(closed, false);
      return { status: 'CANCELLED' };
    },
    close: async () => { closed = true; },
  };

  const execution = executePinnedScan(sshContext(), {
    transport,
    signal: controller.signal,
    requestId: '123e4567-e89b-12d3-a456-426614174000',
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();

  await assert.rejects(execution, (error) => error?.name === 'SshCancellationError' && error?.code === 'SSH_EXECUTION_CANCELLED');
  assert.deepEqual(commands, ['/usr/local/lib/shore-sentinel/run-scan --request 123e4567-e89b-12d3-a456-426614174000']);
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].requestId, '123e4567-e89b-12d3-a456-426614174000');
  assert.ok(cancelled[0].options.timeoutMs <= 10_000);
  assert.equal(closed, true);
});
