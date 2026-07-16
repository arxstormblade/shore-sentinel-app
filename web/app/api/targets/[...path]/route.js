const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

function encodedPath(context) {
  const segments = context?.params?.path || [];
  return segments.map(encodeURIComponent).join('/');
}

async function proxyTargetRequest(request, context) {
  const path = encodedPath(context);
  if (!path) return Response.json({ message: 'Target path is required' }, { status: 400 });

  const headers = new Headers();
  for (const name of ['cookie', 'authorization', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

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
    const contentType = apiResponse.headers.get('content-type');
    if (contentType) responseHeaders.set('content-type', contentType);
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
