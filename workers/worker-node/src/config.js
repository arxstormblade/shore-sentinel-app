function positiveInteger(env, name, fallback, maximum = 60 * 60 * 1000) {
  const raw = env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return value;
}

function sshWorkerConcurrency(env) {
  const raw = env.WORKER_CONCURRENCY ?? '1';
  if (raw !== '1') throw new Error('WORKER_CONCURRENCY must be exactly 1');
  return 1;
}

export function readConfig(env = process.env) {
  const sshTimeoutMs = positiveInteger(env, 'SSH_EXECUTION_TIMEOUT_MS', 120000);
  const parserTimeoutMs = positiveInteger(env, 'PARSER_TIMEOUT_MS', 120000);
  const artifactHandoffTimeoutMs = positiveInteger(env, 'ARTIFACT_HANDOFF_TIMEOUT_MS', 30000);
  const lifecycleEventTimeoutMs = positiveInteger(env, 'LIFECYCLE_EVENT_TIMEOUT_MS', 10000);
  return {
    redisUrl: env.REDIS_URL || 'redis://redis:6379/0',
    apiUrl: (env.API_URL || 'http://api:4000').replace(/\/$/, ''),
    pythonWorkerUrl: (env.PYTHON_WORKER_URL || 'http://worker-python:4100').replace(/\/$/, ''),
    internalWorkerToken: env.INTERNAL_WORKER_TOKEN || '',
    sshTimeoutMs,
    parserTimeoutMs,
    artifactHandoffTimeoutMs,
    lifecycleEventTimeoutMs,
    concurrency: sshWorkerConcurrency(env),

  };
}
