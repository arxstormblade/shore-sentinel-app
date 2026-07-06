import { cookies } from 'next/headers';

const SESSION_COOKIE = 'shore_session';
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const serverApiBase = () => (
  process.env.INTERNAL_API_URL
  || process.env.API_URL
  || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || 'http://api:4000'
).replace(/\/$/, '');

export function rememberMeMaxAgeSeconds() {
  return THIRTY_DAYS_SECONDS;
}

export async function getAuthenticatedUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${serverApiBase()}/auth/me`, {
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
