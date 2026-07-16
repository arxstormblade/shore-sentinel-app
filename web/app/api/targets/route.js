import { appPath } from '../../../lib/paths.js';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');
const CREATE_ROLES = new Set(['admin', 'operator']);

async function authorizeEnrollment(request) {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  try {
    const authResponse = await fetch(`${serverApiBase()}/auth/me`, { headers, cache: 'no-store', redirect: 'manual' });
    if (!authResponse.ok) return { response: Response.json({ message: authResponse.status === 401 ? 'Authentication required' : 'Authorization service unavailable' }, { status: authResponse.status === 401 ? 401 : 503 }) };
    const user = await authResponse.json();
    const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.some((role) => CREATE_ROLES.has(role))) return { response: Response.json({ message: 'Insufficient permissions' }, { status: 403 }) };
    return { headers };
  } catch {
    return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
  }
}

function coercePayload(formData) {
  const entries = Object.fromEntries(formData.entries());
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value === '' ? null : value]));
}

export async function POST(request) {
  const authorization = await authorizeEnrollment(request);
  if (authorization.response) return authorization.response;
  const formData = await request.formData();
  try {
    const apiResponse = await fetch(`${serverApiBase()}/targets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...Object.fromEntries(authorization.headers.entries()),
      },
      body: JSON.stringify(coercePayload(formData)),
      redirect: 'manual',
    });

    if (!apiResponse.ok) {
      return new Response(null, { status: 303, headers: { location: appPath('/inventory/new?create=failed') } });
    }

    const created = await apiResponse.json();
    return new Response(null, {
      status: 303,
      headers: { location: appPath(`/inventory/machines/${created.id ?? ''}`) },
    });
  } catch {
    return new Response(null, { status: 303, headers: { location: appPath('/inventory/new?create=unavailable') } });
  }
}
