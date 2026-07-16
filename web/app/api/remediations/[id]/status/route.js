import { appPath } from '../../../../../lib/paths.js';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');
const EDIT_ROLES = new Set(['admin', 'operator', 'analyst']);

function redirectTo(path) {
  return new Response(null, { status: 303, headers: { location: appPath(path) } });
}

async function authorizeStatusMutation(request) {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return { response: Response.json({ message: 'Authentication required' }, { status: 401 }) };
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  try {
    const authResponse = await fetch(`${serverApiBase()}/auth/me`, { headers, cache: 'no-store', redirect: 'manual' });
    if (!authResponse.ok) return { response: Response.json({ message: authResponse.status === 401 ? 'Authentication required' : 'Authorization service unavailable' }, { status: authResponse.status === 401 ? 401 : 503 }) };
    const user = await authResponse.json();
    const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role).toLowerCase()) : [];
    if (!roles.some((role) => EDIT_ROLES.has(role))) return { response: Response.json({ message: 'Insufficient permissions' }, { status: 403 }) };
    return { headers };
  } catch {
    return { response: Response.json({ message: 'Authorization service unavailable' }, { status: 503 }) };
  }
}

export async function POST(request, { params }) {
  const authorization = await authorizeStatusMutation(request);
  if (authorization.response) return authorization.response;
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
        ...Object.fromEntries(authorization.headers.entries()),
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
