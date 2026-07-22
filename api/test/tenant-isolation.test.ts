import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth.service.js';

test('auth.me binds the session user and tenant and rejects a disabled or moved account', async () => {
  const passwordHash = await bcrypt.hash('correct horse battery staple', 4);
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    tenantId: async () => 'tenant-default',
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('password_hash')) {
        return { rows: [{ id: 'user-a', tenant_id: 'tenant-a', email: 'a@example.test', display_name: 'A', password_hash: passwordHash }] };
      }
      if (sql.includes('FROM auth_sessions')) {
        const expiry = new Date(Date.now() + 60 * 60 * 1000);
        return { rows: [{ user_id: 'user-a', tenant_id: 'tenant-a', idle_expires_at: expiry, absolute_expires_at: expiry, revoked_at: null }] };
      }
      return { rows: [{ id: 'user-a', tenant_id: 'tenant-a', email: 'a@example.test', display_name: 'A', roles: ['operator'] }] };
    },
  };
  const auth = new AuthService(db as never);
  const { token } = await auth.login('a@example.test', 'correct horse battery staple');
  const principal = await auth.me(token);

  assert.equal(principal.id, 'user-a');
  assert.equal(principal.tenant_id, 'tenant-a');
  const meQuery = calls.find(({ sql }) => sql.includes('json_agg'));
  assert.ok(meQuery);
  assert.match(meQuery.sql, /u\.tenant_id=\$2/);
  assert.match(meQuery.sql, /u\.disabled_at IS NULL/);
  assert.deepEqual(meQuery.params, ['user-a', 'tenant-a']);
});
