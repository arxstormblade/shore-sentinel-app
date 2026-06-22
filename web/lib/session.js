import { cookies } from 'next/headers';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

export async function getSessionUser() {
  const token = cookies().get('shore_session')?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${serverApiBase()}/auth/me`, {
      headers: { cookie: `shore_session=${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function hasActiveSession() {
  return Boolean(await getSessionUser());
}
