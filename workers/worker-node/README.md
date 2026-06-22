# Worker-node

BullMQ orchestration worker for Shore Sentinel scan jobs. It claims jobs from `shore-sentinel.scan.jobs`, emits run lifecycle events to the API, requests Python parsing, and uploads artifacts back through the API. It intentionally does not write to MinIO directly.

Environment: `REDIS_URL`, `API_URL`, `PYTHON_WORKER_URL`, `WORKER_CONCURRENCY`, `WORKER_MAX_ATTEMPTS`, `WORKER_BACKOFF_MS`.
