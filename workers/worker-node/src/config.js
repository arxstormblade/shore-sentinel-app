export function readConfig(env = process.env) {
  return {
    redisUrl: env.REDIS_URL || 'redis://redis:6379/0',
    apiUrl: (env.API_URL || 'http://api:4000').replace(/\/$/, ''),
    pythonWorkerUrl: (env.PYTHON_WORKER_URL || 'http://worker-python:4100').replace(/\/$/, ''),
    concurrency: Number(env.WORKER_CONCURRENCY || 2),
    maxAttempts: Number(env.WORKER_MAX_ATTEMPTS || 3),
    backoffMs: Number(env.WORKER_BACKOFF_MS || 5000),
  };
}
