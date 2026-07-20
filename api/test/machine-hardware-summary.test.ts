import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

const viewerRequest = { principal: { userId: 'viewer-1', tenantId: 'tenant-1', roles: ['viewer'] }, header: () => undefined } as never;

test('machine detail projects an explicit browser-safe hardware summary allowlist', async () => {
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string) => {
      if (sql.includes('FROM targets t')) {
        return {
          rows: [{
            id: 'target-1',
            name: 'build-host',
            hostname: 'build-host',
            fqdn: 'build-host.internal.example',
            ip_address: '10.20.30.40',
            env: 'Production',
            owner: 'Platform',
            platform: 'linux',
            status: 'online',
            connection_mode: 'ssh_push',
            ssh_auth_method: 'ssh_key',
            ssh_port: 2222,
            ssh_username: 'root',
            ssh_credential_id: 'credential-1',
            last_seen_at: '2026-07-20T10:00:00.000Z',
            latest_heartbeat_at: '2026-07-20T09:59:00.000Z',
            agent_version: '1.1.0',
            scanner_bundle_version: 'scanner-2.3.0',
            runtime_context: { scan_target: '/srv/private', credential: 'sealed-value' },
            host_key_fingerprint: 'SHA256:private-host-key',
            permitted_cidr: '10.20.0.0/16',
            storage_uri: 's3://private-bucket/run.json',
            scanner_raw_output: '<sensitive />',
            finding_count: 0,
            remediation_count: 0,
          }],
        };
      }
      return { rows: [] };
    },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never);

  const result = await app.getTarget('target-1', viewerRequest);

  assert.deepEqual(result.hardware_summary, {
    status: 'online',
    platform: 'linux',
    agent_version: '1.1.0',
    scanner_bundle_version: 'scanner-2.3.0',
    last_seen_at: '2026-07-20T10:00:00.000Z',
    heartbeat_at: '2026-07-20T09:59:00.000Z',
    ssh_port: 2222,
    ssh_auth_method: 'ssh_key',
  });
  assert.deepEqual(Object.keys(result.hardware_summary).sort(), [
    'agent_version',
    'heartbeat_at',
    'last_seen_at',
    'platform',
    'scanner_bundle_version',
    'ssh_auth_method',
    'ssh_port',
    'status',
  ]);
  for (const forbidden of [
    'credential',
    'sealed_secret',
    'ip_address',
    'permitted_cidr',
    'host_key_fingerprint',
    'runtime_context',
    'scan_target',
    'scanner_raw_output',
    'storage_uri',
  ]) {
    assert.equal(forbidden in result.hardware_summary, false, `${forbidden} must never reach the browser summary`);
  }
});

test('machine detail hardware summary degrades malformed optional values to unavailable', async () => {
  const db = {
    tenantId: async () => 'tenant-1',
    query: async (sql: string) => sql.includes('FROM targets t')
      ? { rows: [{
        id: 'target-1',
        status: ' ',
        platform: { label: 'linux' },
        agent_version: 1,
        scanner_bundle_version: '',
        last_seen_at: 'not-a-date',
        latest_heartbeat_at: ['not-a-date'],
        ssh_port: '22.5',
        ssh_auth_method: 'certificate',
      }] }
      : { rows: [] },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never);

  const result = await app.getTarget('target-1', viewerRequest);

  assert.deepEqual(result.hardware_summary, {
    status: null,
    platform: null,
    agent_version: null,
    scanner_bundle_version: null,
    last_seen_at: null,
    heartbeat_at: null,
    ssh_port: null,
    ssh_auth_method: null,
  });
});
