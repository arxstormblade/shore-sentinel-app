const publicApiBase = () => (
  process.env.NEXT_PUBLIC_SHORE_SENTINEL_API_URL
  || process.env.NEXT_PUBLIC_API_URL
  || '/shore-sentinel-api'
).replace(/\/$/, '');

async function parseResponse(res, fallback) {
  const data = await res.json().catch(async () => ({ stdout: await res.text().catch(() => '') }));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}

export async function checkUpdate() {
  const res = await fetch(`${publicApiBase()}/system/update/check`, { method: 'POST', credentials: 'same-origin' });
  return parseResponse(res, 'Failed to check for updates');
}

export async function applyUpdate() {
  const res = await fetch(`${publicApiBase()}/system/update/apply`, { method: 'POST', credentials: 'same-origin' });
  return parseResponse(res, 'Failed to apply update');
}
