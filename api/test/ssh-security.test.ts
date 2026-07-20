import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSshLaunchRequirements } from '../src/ssh-security.js';
import { SCHEMA_SQL } from '../src/schema.js';

const valid = () => ({
  target: { hostname: '10.20.30.40', ssh_port: 22, ssh_credential_id: 'credential-1', credential_disabled_at: null },
  hostKeyPin: { algorithm: 'ssh-ed25519', fingerprint: 'SHA256:valid-pinned-host-key', revoked_at: null },
  egressPolicy: { cidr: '10.20.0.0/16', ssh_port: 22, enabled: true },
  rootPolicy: { root_path: '/srv/shore-sentinel', enabled: true },
  workerGrant: { id: 'grant-1', expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null },
});

test('SSH launch fails closed unless every managed-machine control is enrolled', () => {
  for (const missing of ['hostKeyPin', 'egressPolicy', 'rootPolicy', 'workerGrant']) {
    const input = valid();
    input[missing] = null;
    assert.throws(() => assertSshLaunchRequirements(input), new RegExp(missing.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`), 'i'));
  }
  for (const change of [
    (input) => { input.target.hostname = 'ssh://10.20.30.40/path'; },
    (input) => { input.target.credential_disabled_at = new Date().toISOString(); },
    (input) => { input.hostKeyPin.algorithm = 'ssh-rsa'; },
    (input) => { input.egressPolicy.ssh_port = 2222; },
    (input) => { input.rootPolicy.root_path = '../escape'; },
    (input) => { input.workerGrant.expires_at = new Date(Date.now() - 1).toISOString(); },
  ]) {
    const input = valid();
    change(input);
    assert.throws(() => assertSshLaunchRequirements(input), /SSH launch denied/i);
  }
  assert.deepEqual(assertSshLaunchRequirements(valid()), {
    host: '10.20.30.40',
    port: 22,
    hostKeyPin: 'SHA256:valid-pinned-host-key',
    permittedCidrs: ['10.20.0.0/16'],
    enrolledRoot: '/srv/shore-sentinel',
    grantId: 'grant-1',
  });
});

test('schema persists tenant-scoped SSH enrollment, one-use grants, and cancellation metadata', () => {
  for (const fragment of [
    'CREATE TABLE IF NOT EXISTS ssh_host_key_pins',
    'CREATE TABLE IF NOT EXISTS target_egress_policies',
    'CREATE TABLE IF NOT EXISTS target_root_policies',
    'CREATE TABLE IF NOT EXISTS worker_execution_grants',
    'consumed_at timestamptz',
    'cancellation_requested_at timestamptz',
  ]) assert.match(SCHEMA_SQL, new RegExp(fragment));
});
