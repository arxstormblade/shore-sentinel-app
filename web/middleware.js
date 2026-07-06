import { NextResponse } from 'next/server';

const authPageToApi = new Map([
  ['/auth/login', '/api/auth/login'],
  ['/auth/register', '/api/auth/register'],
]);

const PUBLIC_PATH_PREFIXES = [
  '/auth/',
  '/api/auth/',
  '/_next/',
  '/shore-sentinel-logo',
  '/favicon',
];

function basePath() {
  return process.env.NEXT_PUBLIC_SHORE_SENTINEL_BASE_PATH || '/shore-sentinel';
}

function withoutBasePath(pathname) {
  const base = basePath();
  if (base !== '/' && pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  if (base !== '/' && pathname === base) return '/';
  return pathname;
}

function isPublicPath(pathname) {
  if (pathname === '/' || pathname === '/auth/login' || pathname === '/auth/register') return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function homeUrl(request) {
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.search = '';
  return url;
}

export function middleware(request) {
  const pathname = withoutBasePath(request.nextUrl.pathname);
  const apiPath = authPageToApi.get(pathname);

  if (request.method === 'POST' && apiPath) {
    const url = request.nextUrl.clone();
    url.pathname = apiPath;
    return NextResponse.rewrite(url, { request: { headers: request.headers } });
  }

  const hasSession = Boolean(request.cookies.get('shore_session')?.value);
  if (!hasSession && !isPublicPath(pathname)) {
    const response = NextResponse.redirect(homeUrl(request), 303);
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    return response;
  }

  const response = NextResponse.next();
  if (pathname === '/' || pathname.startsWith('/auth/') || !hasSession) {
    response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
    response.headers.set('Clear-Site-Data', '"cache"');
  }
  return response;
}

export const config = {
  matcher: ['/:path*'],
};
