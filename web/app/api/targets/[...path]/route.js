const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

const AUTHENTICATED_ROLES = ['admin', 'operator', 'analyst', 'viewer'];

function pathSegments(context) {
  return context?.params?.path || [];
}

function encodedPath(segments) {
  return segments.map(encodeURIComponent).join('/');
}

function allowedRoles(method, segments) {
  if (method === 'GET' && segments.length >= 1) return AUTHENTICATED_ROLES;
  if (method === 'POST' && segments.length === 2 && segments[1] === 'scan-jobs') return ['admin', 'operator', 'analyst'];
  if (method === 'PATCH' && segments.length === 1) return ['admin', 'operator'];
  if (method === 'DELETE' && segments.length === 1) return ['admin'];
  return null;
}

async function authorize(request, roles) {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) {
    return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };
  }

  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  try {
    const authResponse = await fetch(`${serverApiBase()}/auth/me`, {
      headers,
      cache: 'no-store',
      redirect: 'manual',
    });
    if (!authResponse.ok) {
      if (authResponse.status === 401) {
        return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };
      }
      if (authResponse.status === 403) {
        return { response: Response.json({ message: 'Access denied' }, { status: 403 }) };
      }
      return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
    }
    const user = await authResponse.json();
    const userRoles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.some((role) => userRoles.includes(role))) {
      return { response: Response.json({ message: 'Insufficient permissions' }, { status: 403 }) };
    }
    return { headers };
  } catch {
    return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
  }
}

async function proxyTargetRequest(request, context) {
  const segments = pathSegments(context);
  const path = encodedPath(segments);
  if (!path) return Response.json({ message: 'Target path is required' }, { status: 400 });

  const roles = allowedRoles(request.method, segments);
  if (!roles) return Response.json({ message: 'Target operation is not allowed' }, { status: 405 });

  const authorizationResult = await authorize(request, roles);
  if (authorizationResult.response) return authorizationResult.response;

  const headers = authorizationResult.headers;
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const init = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.text();

  try {
    const apiResponse = await fetch(`${serverApiBase()}/targets/${path}`, init);
    const body = await apiResponse.text();
    const responseHeaders = new Headers({ 'cache-control': 'no-store, max-age=0' });
    const responseContentType = apiResponse.headers.get('content-type');
    if (responseContentType) responseHeaders.set('content-type', responseContentType);
    return new Response(body, { status: apiResponse.status, headers: responseHeaders });
  } catch {
    return Response.json({ message: 'Managed machine service unavailable' }, { status: 503 });
  }
}

export async function GET(request, context) {
  return proxyTargetRequest(request, context);
}

export async function POST(request, context) {
  return proxyTargetRequest(request, context);
}

export async function PATCH(request, context) {
  return proxyTargetRequest(request, context);
}

export async function DELETE(request, context) {
  return proxyTargetRequest(request, context);
}
