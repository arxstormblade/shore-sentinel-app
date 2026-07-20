import { cookies } from 'next/headers';

const publicApiBase = () => (
  process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || '/shore-sentinel-api'
).replace(/\/$/, '');

export const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || publicApiBase()
).replace(/\/$/, '');

export async function sessionCookieHeader() {
  const cookieStore = await cookies();
  const token = cookieStore.get('shore_session')?.value;
  return token ? { cookie: `shore_session=${token}` } : {};
}

export async function apiGet(path) {
  const url = `${serverApiBase()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { cache: 'no-store', headers: await sessionCookieHeader() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${path} failed with ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  return res.json();
}
