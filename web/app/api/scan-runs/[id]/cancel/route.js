const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

const EDIT_ROLES = new Set(['admin', 'operator']);

function forwardedHeaders(request) {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return null;
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  return headers;
}

async function authorizeCancellation(request) {
  const headers = forwardedHeaders(request);
  if (!headers) return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };

  try {
    const authResponse = await fetch(`${serverApiBase()}/auth/me`, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!authResponse.ok) {
      if (authResponse.status === 401) return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };
      return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
    }
    const user = await authResponse.json();
    const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.some((role) => EDIT_ROLES.has(role))) {
      return { response: Response.json({ message: 'Insufficient permissions' }, { status: 403 }) };
    }
    return { headers };
  } catch {
    return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
  }
}

export async function POST(request, context) {
  const authorization = await authorizeCancellation(request);
  if (authorization.response) return authorization.response;

  const params = await context?.params;
  const runId = typeof params?.id === 'string' ? params.id : '';
  if (!runId) return Response.json({ message: 'Scan run is required' }, { status: 400 });

  try {
    const apiResponse = await fetch(`${serverApiBase()}/scan-runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      headers: authorization.headers,
      cache: 'no-store',
      redirect: 'manual',
    });
    const body = await apiResponse.text();
    const responseHeaders = new Headers({ 'cache-control': 'no-store, max-age=0' });
    const contentType = apiResponse.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    return new Response(body, { status: apiResponse.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'Scan cancellation service unavailable' }, { status: 503 });
  }
}
