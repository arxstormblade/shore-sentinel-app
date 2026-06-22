import { appPath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

function coercePayload(formData) {
  const entries = Object.fromEntries(formData.entries());
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value === '' ? null : value]));
}

export async function POST(request) {
  const formData = await request.formData();
  try {
    const apiResponse = await fetch(`${serverApiBase()}/one-time-audits`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      },
      body: JSON.stringify(coercePayload(formData)),
      redirect: 'manual',
    });

    if (!apiResponse.ok) {
      return new Response(null, { status: 303, headers: { location: appPath('/audits/new?create=failed') } });
    }

    const created = await apiResponse.json();
    return new Response(null, {
      status: 303,
      headers: { location: appPath(`/audits/${created.id ?? ''}`) },
    });
  } catch {
    return new Response(null, { status: 303, headers: { location: appPath('/audits/new?create=unavailable') } });
  }
}
