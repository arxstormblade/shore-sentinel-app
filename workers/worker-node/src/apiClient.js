export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

export function createApiClient(apiUrl) {
  return {
    emitRunEvent: (event) => postJson(`${apiUrl}/runs/${encodeURIComponent(event.runId)}/events`, event),
    uploadArtifact: (payload) => postJson(`${apiUrl}/artifacts`, payload),
  };
}
