import { serializeParserRequest } from './payloadLimits.js';

export function createParserClient({ pythonWorkerUrl, internalWorkerToken, fetchImpl = fetch }) {
  if (typeof pythonWorkerUrl !== 'string' || pythonWorkerUrl.length === 0) throw new Error('Python parser URL is required');
  if (typeof internalWorkerToken !== 'string') throw new Error('Python parser token is required');
  if (typeof fetchImpl !== 'function') throw new Error('Python parser fetch implementation is required');

  return async function parseWithPython({ runId, scannerOutput, contractVersion }) {
    // Compute and bound the exact UTF-8 request body immediately before fetch.
    const body = serializeParserRequest({ runId, scannerOutput, contractVersion });
    const response = await fetchImpl(`${pythonWorkerUrl}/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${internalWorkerToken}` },
      body,
    });
    if (!response.ok) throw new Error('Python parser request failed');
    return response.json();
  };
}
