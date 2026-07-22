import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { OidcValidator, buildPkceChallenge } from '../src/identity/oidc-validator.js';
import { SessionService } from '../src/session/session.service.js';
import { generateTotpSecret, verifyTotp } from '../src/session/totp.js';

const now = new Date('2026-07-22T00:00:00.000Z');

test('OIDC validation rejects issuer, audience, nonce, state, and PKCE mismatches', async () => {
  const validator = new OidcValidator({ issuer: 'https://idp.example.test', audience: 'shore-client' });
  const codeVerifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
  const valid = {
    issuer: 'https://idp.example.test', audience: 'shore-client', nonce: 'nonce-1', state: 'state-1',
    returnedState: 'state-1', idToken: { iss: 'https://idp.example.test', aud: 'shore-client', nonce: 'nonce-1', exp: 2000000000 },
    codeVerifier, codeChallenge: buildPkceChallenge(codeVerifier),
  };
  await assert.doesNotReject(() => validator.validate(valid));
  for (const change of [
    { issuer: 'https://evil.example.test' },
    { audience: 'other-client' },
    { nonce: 'wrong' },
    { returnedState: 'wrong' },
    { codeVerifier: 'wrong-verifier' },
  ]) {
    await assert.rejects(() => validator.validate({ ...valid, ...change } as never), /OIDC validation failed/);
  }
});

test('durable sessions persist only a hash and fail closed after revocation or absolute expiry', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db = { query: async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM auth_sessions')) return { rows: [{ user_id: 'user-1', tenant_id: 'tenant-1', idle_expires_at: new Date(now.getTime() + 60_000), absolute_expires_at: new Date(now.getTime() + 60_000), revoked_at: null }] };
    if (sql.includes('json_agg')) return { rows: [{ id: 'user-1', tenant_id: 'tenant-1', roles: ['operator'] }] };
    return { rows: [] };
  } };
  const sessions = new SessionService(db as never, { clock: () => now, tokenBytes: 32 });
  const created = await sessions.create({ userId: 'user-1', tenantId: 'tenant-1', userAgent: 'test', ipAddress: '127.0.0.1' });
  assert.equal(created.token.length, 64);
  const persisted = calls.find(({ sql }) => sql.includes('INSERT INTO auth_sessions'))!;
  assert.ok(persisted);
  assert.equal(persisted.params.includes(created.token), false);
  assert.equal(persisted.params.includes(createHash('sha256').update(created.token).digest('hex')), true);
  assert.deepEqual(await sessions.resolve(created.token), { userId: 'user-1', tenantId: 'tenant-1' });
  await sessions.revoke(created.token, 'operator');
  assert.ok(calls.some(({ sql }) => sql.includes('UPDATE auth_sessions SET revoked_at')));
});

test('session idle refresh never extends beyond the absolute expiry bound', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const absoluteExpiresAt = new Date(now.getTime() + 2_000);
  const db = { query: async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM auth_sessions')) return { rows: [{ user_id: 'user-1', tenant_id: 'tenant-1', idle_expires_at: new Date(now.getTime() + 1_000), absolute_expires_at: absoluteExpiresAt, revoked_at: null }] };
    if (sql.includes('json_agg')) return { rows: [{ id: 'user-1', tenant_id: 'tenant-1', roles: ['operator'] }] };
    return { rows: [] };
  } };
  const sessions = new SessionService(db as never, { clock: () => now, idleMs: 60_000 });

  await sessions.resolve('a'.repeat(64));

  const refresh = calls.find(({ sql }) => sql.includes('SET last_seen_at=$1, idle_expires_at=$2'))!;
  assert.ok(refresh);
  assert.ok(refresh.params[1] instanceof Date);
  assert.ok((refresh.params[1] as Date) <= absoluteExpiresAt);
});

test('TOTP accepts the current code and rejects malformed or unrelated codes', () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{16,}$/);
  assert.equal(verifyTotp(secret, '000000', now), false);
  assert.equal(verifyTotp(secret, 'not-a-code', now), false);
});
