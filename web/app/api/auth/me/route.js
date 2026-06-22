const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

export async function GET(request) {
  try {
    const cookie = request.headers.get('cookie') || '';
    const apiResponse = await fetch(`${serverApiBase()}/auth/me`, {
      headers: { cookie },
      cache: 'no-store',
    });
    const body = await apiResponse.text();
    return new Response(body, {
      status: apiResponse.status,
      headers: {
        'content-type': apiResponse.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store, max-age=0',
      },
    });
  } catch {
    return Response.json({ message: 'Auth service unavailable' }, { status: 503 });
  }
}
