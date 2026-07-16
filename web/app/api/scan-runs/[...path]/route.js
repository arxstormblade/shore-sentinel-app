const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

const READ_ROLES = new Set(['admin', 'operator', 'analyst', 'viewer']);
const READ_SUBRESOURCES = new Set(['events', 'artifacts']);

function allowedPath(segments) {
  return segments.length === 1 || (segments.length === 2 && READ_SUBRESOURCES.has(segments[1]));
}

export async function GET(request, context) {
  const segments = context?.params?.path || [];
  const path = segments.map(encodeURIComponent).join('/');
  if (!path) return Response.json({ message: 'Scan run path is required' }, { status: 400 });
  if (!allowedPath(segments)) return Response.json({ message: 'Scan run operation is not allowed' }, { status: 405 });

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return Response.json({ message: 'Authentication required' }, { status: 401 });
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  try {
    const authResponse = await fetch(`${serverApiBase()}/auth/me`, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!authResponse.ok) {
      if (authResponse.status === 401) return Response.json({ message: 'Authentication required' }, { status: 401 });
      if (authResponse.status === 403) return Response.json({ message: 'Access denied' }, { status: 403 });
      return Response.json({ message: 'Authorization service unavailable' }, { status: 503 });
    }
    const user = await authResponse.json();
    const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.some((role) => READ_ROLES.has(role))) {
      return Response.json({ message: 'Insufficient permissions' }, { status: 403 });
    }

    const apiResponse = await fetch(`${serverApiBase()}/scan-runs/${path}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });
    const body = await apiResponse.text();
    const responseHeaders = new Headers({ 'cache-control': 'no-store, max-age=0' });
    const contentType = apiResponse.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
    return new Response(body, { status: apiResponse.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'Scan progress service unavailable' }, { status: 503 });
  }
}
