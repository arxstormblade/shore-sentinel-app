const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

const hopByHopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function responseHeaders(apiResponse) {
  const headers = new Headers();
  const contentType = apiResponse.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store, max-age=0');
  return headers;
}

async function proxyUsers(request, segments = []) {
  const suffix = segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : '';
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  const contentType = request.headers.get('content-type');
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  if (contentType) headers.set('content-type', contentType);

  const init = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  try {
    const apiResponse = await fetch(`${serverApiBase()}/users${suffix}`, init);
    const body = await apiResponse.text();
    return new Response(body, {
      status: apiResponse.status,
      headers: responseHeaders(apiResponse),
    });
  } catch {
    return Response.json({ message: 'Users service unavailable' }, { status: 503 });
  }
}

export { proxyUsers };

export async function GET(request) {
  return proxyUsers(request);
}

export async function POST(request) {
  return proxyUsers(request);
}
