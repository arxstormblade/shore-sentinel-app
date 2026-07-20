import assert from 'node:assert/strict';
import test from 'node:test';

const cancelRouteUrl = new URL('../app/api/scan-runs/[id]/cancel/route.js', import.meta.url);

function cancelRequest({ cookie, authorization } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  return new Request('http://web.local/api/scan-runs/scan-123/cancel', { method: 'POST', headers });
}

function header(call, name) {
  return new Headers(call.init.headers).get(name);
}

async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('scan-run cancellation proxy permits only authenticated edit roles and fails closed before forwarding', async () => {
  const previousInternalApiUrl = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://api.internal:4000/';

  try {
    const { POST, GET } = await import(cancelRouteUrl.href);
    assert.equal(typeof POST, 'function');
    assert.equal(GET, undefined, 'the exact cancellation route must not expose GET');

    await withFetch(async () => {
      throw new Error('authorization must not be called without credentials');
    }, async () => {
      const response = await POST(cancelRequest());
      assert.equal(response.status, 401);
    });

    for (const role of ['admin', 'operator']) {
      const calls = [];
      await withFetch(async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/auth/me')) return Response.json({ roles: [role] });
        return Response.json({ id: 'scan-123', status: 'cancelled' });
      }, async () => {
        const response = await POST(cancelRequest({
          cookie: `shore_session=${role}-cookie`,
          authorization: `Bearer ${role}-token`,
        }), { params: Promise.resolve({ id: 'scan-123' }) });
        assert.equal(response.status, 200);
      });
      assert.equal(calls.length, 2, `${role} is authorized before a single cancel forward`);
      assert.equal(calls[0].url, 'http://api.internal:4000/auth/me');
      assert.equal(calls[1].url, 'http://api.internal:4000/scan-runs/scan-123/cancel');
      assert.equal(calls[1].init.method, 'POST');
      assert.equal(header(calls[0], 'cookie'), `shore_session=${role}-cookie`);
      assert.equal(header(calls[1], 'cookie'), `shore_session=${role}-cookie`);
      assert.equal(header(calls[0], 'authorization'), `Bearer ${role}-token`);
      assert.equal(header(calls[1], 'authorization'), `Bearer ${role}-token`);
    }

    for (const role of ['analyst', 'viewer']) {
      let forwarded = false;
      await withFetch(async (url) => {
        if (String(url).endsWith('/auth/me')) return Response.json({ roles: [role] });
        forwarded = true;
        return Response.json({ id: 'scan-123', status: 'cancelled' });
      }, async () => {
        const response = await POST(cancelRequest({ cookie: `shore_session=${role}-cookie` }), { params: Promise.resolve({ id: 'scan-123' }) });
        assert.equal(response.status, 403);
      });
      assert.equal(forwarded, false, `${role} must be denied before cancellation is forwarded`);
    }

    let outageCalls = 0;
    await withFetch(async () => {
      outageCalls += 1;
      throw new Error('authorization unavailable');
    }, async () => {
      const response = await POST(cancelRequest({ cookie: 'shore_session=operator-cookie' }), { params: Promise.resolve({ id: 'scan-123' }) });
      assert.equal(response.status, 503);
    });
    assert.equal(outageCalls, 1, 'authorization outages must fail closed without forwarding');
  } finally {
    if (previousInternalApiUrl === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previousInternalApiUrl;
  }
});
