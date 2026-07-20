// The parser accepts a 1 MiB HTTP request. SSH stdout is deliberately lower so
// the full JSON request envelope and the raw artifact both fit without relying
// on a nominal raw-stdout limit. The Python duplicate is parity-tested.
export const PARSER_REQUEST_MAX_BYTES = 1024 * 1024;
export const SSH_SCANNER_OUTPUT_MAX_BYTES = 512 * 1024;
export const SSH_STDERR_MAX_BYTES = 64 * 1024;
export const RAW_SCANNER_ARTIFACT_MAX_BYTES = SSH_SCANNER_OUTPUT_MAX_BYTES;

export function assertScannerOutputBytes(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > SSH_SCANNER_OUTPUT_MAX_BYTES) {
    throw new Error('Scanner payload exceeds configured byte limit');
  }
}

export function serializeParserRequest({ runId, scannerOutput, contractVersion }) {
  let body;
  try {
    body = JSON.stringify({ runId, scannerOutput, contractVersion });
  } catch {
    throw new Error('Scanner payload is invalid');
  }
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > PARSER_REQUEST_MAX_BYTES) {
    throw new Error('Scanner payload exceeds configured byte limit');
  }
  return body;
}
