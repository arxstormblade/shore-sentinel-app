import { appPath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

function redirectTo(path) {
  return new Response(null, { status: 303, headers: { location: appPath(path) } });
}

export async function POST(request, { params }) {
  const formData = await request.formData();
  const status = formData.get('status');
  const remediationId = params?.id || '';

  if (typeof status !== 'string' || !status.trim() || !remediationId) {
    return redirectTo(`/remediation/${remediationId || ''}?status=failed`);
  }

  try {
    const apiResponse = await fetch(`${serverApiBase()}/remediations/${remediationId}/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      },
      body: JSON.stringify({ status }),
      redirect: 'manual',
    });

    if (!apiResponse.ok) {
      return redirectTo(`/remediation/${remediationId}?status=failed`);
    }

    return redirectTo(`/remediation/${remediationId}`);
  } catch {
    return redirectTo(`/remediation/${remediationId}?status=unavailable`);
  }
}
