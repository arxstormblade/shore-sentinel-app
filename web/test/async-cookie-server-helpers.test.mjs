import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webRoot = new URL('../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, webRoot), 'utf8');
}

test('Next 16 server helpers await the asynchronous cookies API before reading the session', async () => {
  const [session, apiData] = await Promise.all([
    source('lib/session.js'),
    source('lib/api-data.js'),
  ]);

  assert.match(session, /const\s+cookieStore\s*=\s*await\s+cookies\(\)/);
  assert.match(apiData, /const\s+cookieStore\s*=\s*await\s+cookies\(\)/);
  assert.match(apiData, /headers:\s*await\s+sessionCookieHeader\(\)/);
  assert.doesNotMatch(session, /cookies\(\)\.get/);
  assert.doesNotMatch(apiData, /cookies\(\)\.get/);
});
