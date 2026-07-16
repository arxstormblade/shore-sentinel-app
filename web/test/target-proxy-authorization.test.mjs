import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/targets/[...path]/route.js';
import { POST as createTarget } from '../app/api/targets/route.js';
import { POST as updateRemediationStatus } from '../app/api/remediations/[id]/status/route.js';

function requestFor(path, token) {
  return new Request(`http://web.local/api/targets/${path}`, {
    method: 'POST',
    headers: { cookie: `shore_session=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ priority: 50 }),
  });
}

function formRequest(url, { cookie, authorization, fields }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  return new Request(url, { method: 'POST', headers, body: form });
}

function header(call, name) {
  return new Headers(call.init.headers).get(name);
}

test('target scan proxy denies a viewer before it forwards the mutation', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['viewer'] });
    forwarded = true;
    return Response.json({ queued: true });
  };

  try {
    const response = await POST(requestFor('target-1/scan-jobs', 'viewer-token'), { params: { path: ['target-1', 'scan-jobs'] } });
    assert.equal(response.status, 403);
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target scan proxy forwards an analyst mutation only after role verification', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['analyst'] });
    return Response.json({ queued: true });
  };

  try {
    const response = await POST(requestFor('target-1/scan-jobs', 'analyst-token'), { params: { path: ['target-1', 'scan-jobs'] } });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/targets\/target-1\/scan-jobs$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target enrollment proxy denies a viewer before it reads or forwards credentials', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['viewer'] });
    forwarded = true;
    return Response.json({ id: 'target-1' });
  };

  try {
    const response = await createTarget(formRequest('http://web.local/api/targets', {
      cookie: 'shore_session=viewer-token',
      fields: { hostname: 'viewer-host', ssh_password: 'must-not-forward' },
    }));
    assert.equal(response.status, 403);
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target enrollment proxy rejects an unauthenticated request without calling authorization', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ id: 'target-1' });
  };

  try {
    const response = await createTarget(formRequest('http://web.local/api/targets', {
      fields: { hostname: 'unauthenticated-host' },
    }));
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target enrollment proxy authorizes an operator before forwarding cookies and Bearer credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['operator'] });
    return Response.json({ id: 'target-1' });
  };

  try {
    const response = await createTarget(formRequest('http://web.local/api/targets', {
      cookie: 'shore_session=operator-cookie',
      authorization: 'Bearer operator-token',
      fields: { hostname: 'operator-host', ssh_port: '22' },
    }));
    assert.equal(response.status, 303);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/auth\/me$/);
    assert.match(calls[1].url, /\/targets$/);
    assert.equal(calls[1].init.method, 'POST');
    assert.equal(header(calls[0], 'cookie'), 'shore_session=operator-cookie');
    assert.equal(header(calls[1], 'cookie'), 'shore_session=operator-cookie');
    assert.equal(header(calls[0], 'authorization'), 'Bearer operator-token');
    assert.equal(header(calls[1], 'authorization'), 'Bearer operator-token');
    assert.deepEqual(JSON.parse(calls[1].init.body), { hostname: 'operator-host', ssh_port: '22' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target enrollment proxy fails closed when authorization returns a non-401 failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({ message: 'unavailable' }, { status: 500 });
  };

  try {
    const response = await createTarget(formRequest('http://web.local/api/targets', {
      cookie: 'shore_session=operator-cookie',
      fields: { hostname: 'operator-host' },
    }));
    assert.equal(response.status, 503);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/auth\/me$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('target enrollment proxy fails closed when authorization is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('authorization transport unavailable');
  };

  try {
    const response = await createTarget(formRequest('http://web.local/api/targets', {
      cookie: 'shore_session=operator-cookie',
      fields: { hostname: 'operator-host' },
    }));
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remediation status proxy denies a viewer before it forwards the mutation', async () => {
  const originalFetch = globalThis.fetch;
  let forwarded = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['viewer'] });
    forwarded = true;
    return Response.json({ status: 'resolved' });
  };

  try {
    const response = await updateRemediationStatus(formRequest('http://web.local/api/remediations/remediation-1/status', {
      cookie: 'shore_session=viewer-token',
      fields: { status: 'resolved' },
    }), { params: { id: 'remediation-1' } });
    assert.equal(response.status, 403);
    assert.equal(forwarded, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remediation status proxy rejects an unauthenticated request without calling authorization', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ status: 'resolved' });
  };

  try {
    const response = await updateRemediationStatus(formRequest('http://web.local/api/remediations/remediation-1/status', {
      fields: { status: 'resolved' },
    }), { params: { id: 'remediation-1' } });
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remediation status proxy authorizes an analyst before forwarding cookies and Bearer credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/me')) return Response.json({ roles: ['analyst'] });
    return Response.json({ status: 'resolved' });
  };

  try {
    const response = await updateRemediationStatus(formRequest('http://web.local/api/remediations/remediation-1/status', {
      cookie: 'shore_session=analyst-cookie',
      authorization: 'Bearer analyst-token',
      fields: { status: 'resolved' },
    }), { params: { id: 'remediation-1' } });
    assert.equal(response.status, 303);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/auth\/me$/);
    assert.match(calls[1].url, /\/remediations\/remediation-1\/status$/);
    assert.equal(calls[1].init.method, 'PATCH');
    assert.equal(header(calls[0], 'cookie'), 'shore_session=analyst-cookie');
    assert.equal(header(calls[1], 'cookie'), 'shore_session=analyst-cookie');
    assert.equal(header(calls[0], 'authorization'), 'Bearer analyst-token');
    assert.equal(header(calls[1], 'authorization'), 'Bearer analyst-token');
    assert.deepEqual(JSON.parse(calls[1].init.body), { status: 'resolved' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remediation status proxy fails closed when authorization returns a non-401 failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({ message: 'unavailable' }, { status: 503 });
  };

  try {
    const response = await updateRemediationStatus(formRequest('http://web.local/api/remediations/remediation-1/status', {
      cookie: 'shore_session=analyst-cookie',
      fields: { status: 'resolved' },
    }), { params: { id: 'remediation-1' } });
    assert.equal(response.status, 503);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/auth\/me$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('remediation status proxy fails closed when authorization is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('authorization transport unavailable');
  };

  try {
    const response = await updateRemediationStatus(formRequest('http://web.local/api/remediations/remediation-1/status', {
      cookie: 'shore_session=analyst-cookie',
      fields: { status: 'resolved' },
    }), { params: { id: 'remediation-1' } });
    assert.equal(response.status, 503);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
