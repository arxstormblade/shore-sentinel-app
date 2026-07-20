import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

test('target scan creation persists the authenticated requester in scan_jobs', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const app = new AppController(
    {
      query: async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('FROM targets t')) {
          return { rows: [{ hostname: '10.1.2.3', ssh_port: 22, ssh_credential_id: 'credential-a', credential_disabled_at: null, algorithm: 'ssh-ed25519', fingerprint: 'SHA256:valid', revoked_at: null, cidr: '10.1.0.0/16', policy_port: 22, policy_enabled: true, root_path: '/srv/shore-sentinel', root_enabled: true }] };
        }
        if (sql.includes('INSERT INTO scan_dispatch_outbox')) {
          return { rows: [{ job: { id: 'job-a' }, run: { id: 'run-a', runtime_context: {} }, dispatch_id: 'dispatch-a' }] };
        }
        return { rows: [] };
      },
      isReady: () => true,
    } as never,
    {} as never,
    { deliverScanDispatch: async () => ({ queued: true }) } as never,
    {} as never,
    {} as never,
  );
  await app.runTarget('target-a', {}, {
    principal: { userId: 'requester-a', tenantId: 'tenant-a', roles: ['operator'] },
    header: () => undefined,
  } as never);

  const creation = calls.find(({ sql }) => sql.includes('INSERT INTO scan_jobs'))!;
  assert.match(creation.sql, /scan_jobs \(tenant_id,subject_type,target_id,one_time_audit_id,requested_by,/);
  assert.ok(creation.params.includes('requester-a'));
});
