import { NextResponse } from 'next/server';

const authPageToApi = new Map([
  ['/auth/login', '/api/auth/login'],
  ['/auth/register', '/api/auth/register'],
]);

function withoutBasePath(pathname) {
  const basePath = process.env.NEXT_PUBLIC_SHORE_SENTINEL_BASE_PATH || '/shore-sentinel';
  if (basePath !== '/' && pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  if (basePath !== '/' && pathname === basePath) return '/';
  return pathname;
}

export function middleware(request) {
  const pathname = withoutBasePath(request.nextUrl.pathname);
  const apiPath = authPageToApi.get(pathname);

  if (request.method === 'POST' && apiPath) {
    const url = request.nextUrl.clone();
    url.pathname = apiPath;
    return NextResponse.rewrite(url, {
      request: {
        headers: request.headers,
      },
    });
  }

  const response = NextResponse.next();
  if (pathname === '/' || pathname.startsWith('/auth/')) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Clear-Site-Data', '"cache"');
  }
  return response;
}

export const config = {
  matcher: ['/', '/auth/:path*', '/shore-sentinel', '/shore-sentinel/auth/:path*'],
};
