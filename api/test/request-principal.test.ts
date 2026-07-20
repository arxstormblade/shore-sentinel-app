import test from 'node:test';
import assert from 'node:assert/strict';
import { attachSessionPrincipal } from '../src/request-principal.js';

test('session middleware attaches the validated immutable user-and-tenant principal', async () => {
  const req = { cookies: { shore_session: 'session-token' }, headers: {} } as any;
  let nextCalls = 0;
  let response: { statusCode?: number; body?: unknown } = {};
  const res = {
    status: (statusCode: number) => ({ json: (body: unknown) => { response = { statusCode, body }; } }),
  };
  await attachSessionPrincipal(
    { me: async (token?: string) => ({ id: token === 'session-token' ? 'user-a' : '', tenant_id: 'tenant-a', roles: ['operator'] }) } as never,
    req,
    res as never,
    () => { nextCalls += 1; },
  );

  assert.equal(nextCalls, 1);
  assert.equal(response.statusCode, undefined);
  assert.deepEqual(req.principal, { userId: 'user-a', tenantId: 'tenant-a', roles: ['operator'] });
});

test('session middleware fails closed when validation does not yield a usable principal', async () => {
  const req = { headers: { authorization: 'Bearer invalid' } } as any;
  let nextCalls = 0;
  let response: { statusCode?: number; body?: unknown } = {};
  const res = {
    status: (statusCode: number) => ({ json: (body: unknown) => { response = { statusCode, body }; } }),
  };
  await attachSessionPrincipal(
    { me: async () => ({ id: 'user-a', tenant_id: '', roles: ['operator'] }) } as never,
    req,
    res as never,
    () => { nextCalls += 1; },
  );

  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 401);
});
