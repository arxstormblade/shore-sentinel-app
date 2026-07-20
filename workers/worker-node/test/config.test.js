import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

test('SSH worker configuration defaults to exactly one concurrent execution', () => {
  assert.equal(readConfig({}).concurrency, 1);
});

test('SSH worker configuration rejects every explicit concurrency value except literal one', () => {
  for (const value of ['0', '2', '01', 'not-a-number']) {
    assert.throws(
      () => readConfig({ WORKER_CONCURRENCY: value }),
      /WORKER_CONCURRENCY must be exactly 1/,
      `WORKER_CONCURRENCY=${value} must be rejected`,
    );
  }
  assert.equal(readConfig({ WORKER_CONCURRENCY: '1' }).concurrency, 1);
});
