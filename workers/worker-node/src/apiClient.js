export async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GET ${url} failed: ${response.status} ${text}`);
  }
  return response.json();
}

export function createApiClient(apiUrl, internalWorkerToken) {
  const internalHeaders = () => {
    if (!internalWorkerToken) throw new Error('INTERNAL_WORKER_TOKEN is required for managed SSH execution');
    return { authorization: `Bearer ${internalWorkerToken}` };
  };
  const capabilityHeaders = (workerCapability) => {
    if (typeof workerCapability !== 'string' || workerCapability.length === 0) {
      throw new Error('worker capability is required for managed SSH lifecycle writes');
    }
    return { 'x-worker-capability': workerCapability };
  };
  return {
    emitRunEvent: (event, workerCapability) => postJson(`${apiUrl}/runs/${encodeURIComponent(event.runId)}/events`, event, { ...internalHeaders(), ...capabilityHeaders(workerCapability) }),
    uploadArtifact: (payload, workerCapability) => postJson(`${apiUrl}/artifacts`, payload, { ...internalHeaders(), ...capabilityHeaders(workerCapability) }),
    fetchSshGrant: (runId, targetId, attempt) => postJson(`${apiUrl}/internal/worker/runs/${encodeURIComponent(runId)}/ssh-grant`, { targetId, attempt }, internalHeaders()),
    getRunControl: (runId) => getJson(`${apiUrl}/internal/worker/runs/${encodeURIComponent(runId)}/control`, internalHeaders()),
    reconcileArtifactCleanup: ({ tenantId, runId }) => postJson(`${apiUrl}/internal/worker/artifact-cleanup/reconcile`, { tenantId, runId }, internalHeaders()),
  };
}
