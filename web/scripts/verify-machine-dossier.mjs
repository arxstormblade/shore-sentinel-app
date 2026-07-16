import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const targetRoute = await import(pathToFileURL(join(root, 'app/api/targets/[...path]/route.js')).href);
const scanRunRoute = await import(pathToFileURL(join(root, 'app/api/scan-runs/[...path]/route.js')).href);
const originalFetch = globalThis.fetch;

async function exerciseTargetMutation({ method, roles, authenticated = true, authStatus = null, path }) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    calls.push({ url: value, method: init.method || 'GET' });
    if (value.endsWith('/auth/me')) {
      if (authStatus) return Response.json({ message: 'Auth unavailable' }, { status: authStatus });
      if (!authenticated) return Response.json({ message: 'Unauthenticated' }, { status: 401 });
      return Response.json({ id: 'qa-user', roles });
    }
    return Response.json({ run: { id: 'run-1', status: 'queued' }, ok: true }, { status: method === 'POST' ? 201 : 200 });
  };

  const headers = authenticated
    ? { cookie: 'shore_session=qa-token', 'content-type': 'application/json' }
    : { 'content-type': 'application/json' };
  const request = new Request('http://shore.local/api/targets/' + path.join('/'), {
    method,
    headers,
    body: method === 'POST' || method === 'PATCH' ? JSON.stringify({ mode: 'ssh_push' }) : undefined,
  });
  const handler = targetRoute[method];
  const response = await handler(request, { params: { path } });
  return { response, calls };
}

async function exerciseScanRunRead({ roles, authenticated = true, path = ['run-1'] }) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const value = String(url);
    calls.push(value);
    if (value.endsWith('/auth/me')) {
      if (!authenticated) return Response.json({ message: 'Unauthenticated' }, { status: 401 });
      return Response.json({ id: 'qa-user', roles });
    }
    return Response.json({ id: 'run-1', status: 'completed' });
  };
  const request = new Request('http://shore.local/api/scan-runs/' + path.join('/'), {
    headers: authenticated ? { cookie: 'shore_session=qa-token' } : {},
  });
  const response = await scanRunRoute.GET(request, { params: { path } });
  return { response, calls };
}

try {
  const unauthenticated = await exerciseTargetMutation({ method: 'POST', roles: [], authenticated: false, path: ['machine-1', 'scan-jobs'] });
  assert.equal(unauthenticated.response.status, 401, 'unauthenticated scan launch must fail closed');
  assert.equal(unauthenticated.calls.some((call) => call.url.includes('/targets/')), false, 'unauthenticated request must not reach the target API');

  const authOutage = await exerciseTargetMutation({ method: 'POST', roles: [], authStatus: 503, path: ['machine-1', 'scan-jobs'] });
  assert.equal(authOutage.response.status, 503, 'authorization outage must remain distinguishable from bad credentials');
  assert.equal(authOutage.calls.some((call) => call.url.includes('/targets/')), false, 'authorization outage must fail before the target API');

  const viewerScan = await exerciseTargetMutation({ method: 'POST', roles: ['viewer'], path: ['machine-1', 'scan-jobs'] });
  assert.equal(viewerScan.response.status, 403, 'viewer must not launch scans');
  assert.equal(viewerScan.calls.some((call) => call.url.includes('/targets/')), false, 'forbidden request must not reach the target API');

  const analystScan = await exerciseTargetMutation({ method: 'POST', roles: ['analyst'], path: ['machine-1', 'scan-jobs'] });
  assert.equal(analystScan.response.status, 201, 'analyst may launch a scan per ROLE_MATRIX');

  const operatorEdit = await exerciseTargetMutation({ method: 'PATCH', roles: ['operator'], path: ['machine-1'] });
  assert.equal(operatorEdit.response.status, 200, 'operator may edit managed machines per ROLE_MATRIX');

  const operatorDelete = await exerciseTargetMutation({ method: 'DELETE', roles: ['operator'], path: ['machine-1'] });
  assert.equal(operatorDelete.response.status, 403, 'operator must not delete a managed machine');

  const adminDelete = await exerciseTargetMutation({ method: 'DELETE', roles: ['admin'], path: ['machine-1'] });
  assert.equal(adminDelete.response.status, 200, 'admin may delete a managed machine');

  const unauthenticatedRead = await exerciseScanRunRead({ roles: [], authenticated: false });
  assert.equal(unauthenticatedRead.response.status, 401, 'unauthenticated scan-run reads must fail closed');
  assert.equal(unauthenticatedRead.calls.some((url) => url.includes('/scan-runs/')), false, 'unauthenticated read must not reach the scan API');

  const viewerRead = await exerciseScanRunRead({ roles: ['viewer'] });
  assert.equal(viewerRead.response.status, 200, 'authenticated viewers may read scan progress');

  console.log('Managed machine proxy authorization verification passed.');
} finally {
  globalThis.fetch = originalFetch;
}
