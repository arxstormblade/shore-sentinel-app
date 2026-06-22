import { appPath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

async function forwardAuth(path, formData) {
  const payload = Object.fromEntries(formData.entries());
  return fetch(`${serverApiBase()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'manual',
  });
}

function normalizeAuthCookie(apiCookie) {
  if (!apiCookie) return null;
  const withoutPath = apiCookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => !/^path=/i.test(part));
  return [...withoutPath, 'Path=/'].join('; ');
}

function redirectTo(path, apiCookie) {
  const headers = new Headers({ location: appPath(path) });
  const normalizedCookie = normalizeAuthCookie(apiCookie);
  if (normalizedCookie) headers.append('set-cookie', normalizedCookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request) {
  const formData = await request.formData();
  try {
    const apiResponse = await forwardAuth('/auth/login', formData);
    if (!apiResponse.ok) return redirectTo('/?auth=failed');
    return redirectTo('/dashboard', apiResponse.headers.get('set-cookie'));
  } catch {
    return redirectTo('/?auth=unavailable');
  }
}
