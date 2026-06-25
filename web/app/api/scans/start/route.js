import { appPath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://api:4000').replace(/\/$/, '');

function coercePayload(formData) {
  const entries = Object.fromEntries(formData.entries());
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value === '' ? null : value]));
}

export async function POST(request) {
  const formData = await request.formData();
  try {
    // 1. Create the audit target via the API
    const auditResponse = await fetch(`${serverApiBase()}/one-time-audits`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      },
      body: JSON.stringify(coercePayload(formData)),
      redirect: 'manual',
    });

    if (!auditResponse.ok) {
      return new Response(null, { status: 303, headers: { location: appPath('/scans/start?create=failed') } });
    }

    const created = await auditResponse.json();
    const auditId = created.id;
    if (!auditId) {
      return new Response(null, { status: 303, headers: { location: appPath('/scans/start?create=failed') } });
    }

    // 2. Kick off the scan run for this audit
    let runId = null;
    try {
      const runResponse = await fetch(`${serverApiBase()}/one-time-audits/${auditId}/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
        },
        body: JSON.stringify({}),
        redirect: 'manual',
      });
      if (runResponse.ok) {
        const runPayload = await runResponse.json();
        runId = runPayload.id || runPayload.run_id || auditId;
      }
    } catch {
      // run creation failed but audit exists -- let user see the audit page
    }

    // 3. Redirect to the report page (which shows progress + final report)
    if (runId) {
      return new Response(null, {
        status: 303,
        headers: { location: appPath(`/scans-reports/reports/${runId}`) },
      });
    }

    // Fallback: send them to the audit detail page so they can trigger manually
    return new Response(null, {
      status: 303,
      headers: { location: appPath(`/scans-reports`) },
    });
  } catch {
    return new Response(null, { status: 303, headers: { location: appPath('/scans/start?create=unavailable') } });
  }
}
