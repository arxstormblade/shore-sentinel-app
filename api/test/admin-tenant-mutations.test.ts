import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/app.controller.js';

const crossTenantAdmin = { principal: { userId: 'admin-a', tenantId: 'tenant-a', roles: ['admin'] }, header: () => undefined } as never;

function appWithCrossTenantTarget() {
  const writes: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      if (/^SELECT id FROM users WHERE tenant_id=\$1 AND id=\$2/.test(sql)) return { rows: [] };
      writes.push({ sql, params });
      return { rows: [] };
    },
  };
  return { app: new AppController(db as never, {} as never, {} as never, {} as never, {} as never), writes };
}

test('cross-tenant admin user mutations fail before password, roles, audit, or user records change', async () => {
  const operations: Array<(app: AppController) => Promise<unknown>> = [
    (app) => app.updateUser('user-b', { display_name: 'other tenant', roles: ['viewer'] }, crossTenantAdmin),
    (app) => app.resetPassword('user-b', { password: 'correct horse battery staple' }, crossTenantAdmin),
    (app) => app.disableUser('user-b', crossTenantAdmin),
    (app) => app.enableUser('user-b', crossTenantAdmin),
    (app) => app.deleteUser('user-b', crossTenantAdmin),
  ];
  for (const operation of operations) {
    const { app, writes } = appWithCrossTenantTarget();
    await assert.rejects(() => operation(app), /user not found/);
    assert.deepEqual(writes, []);
  }
});

test('target deletion removes group memberships only through a tenant-owned group', async () => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id, hostname FROM targets')) return { rows: [{ id: 'target-a', hostname: 'host-a' }] };
      return { rows: [] };
    },
  };
  const app = new AppController(db as never, {} as never, {} as never, {} as never, {} as never);
  await app.deleteTarget('target-a', crossTenantAdmin);
  const membershipCleanup = calls.find(({ sql }) => sql.includes('DELETE FROM target_group_members'))!;
  assert.match(membershipCleanup.sql, /USING target_groups tg/);
  assert.match(membershipCleanup.sql, /tgm\.target_group_id=tg\.id/);
  assert.match(membershipCleanup.sql, /tg\.tenant_id=\$1/);
  assert.deepEqual(membershipCleanup.params, ['tenant-a', 'target-a']);
});
