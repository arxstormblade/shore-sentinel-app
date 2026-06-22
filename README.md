# Shore Sentinel

Dockerized security scanning, audit, inventory, reporting, and managed-machine control plane.

This app defines the local infrastructure contract for the MVP:
- Postgres for application state
- Redis for queue/cache coordination
- MinIO for scan artifacts and generated reports
- Node.js API on `http://localhost:4000`
- Next.js web app on `http://localhost:3010`
- Node worker for scan orchestration jobs
- Python worker for parsing, normalization, and report enrichment

See `../../documents/shore-sentinel-architecture.md` for the architecture and MVP scope.

## Local setup

1. Copy the sample environment and replace every `replace-me` value before using non-local data:

   ```bash
   cp .env.example .env
   ```

2. Validate the Compose model and smoke behavior:

   ```bash
   npm run compose:smoke
   ```

   If Docker daemon access is available, the helper will run `docker compose config` and `docker compose ps`. If the shell has stale group membership but the account is already in the `docker` group, the helper retries through `sg docker`. If the socket is not accessible in this session and the user is not in the `docker` group, the helper prints a skip message and still passes the scaffold validation path.

3. Start the local stack on a host with Docker daemon access:

   ```bash
   docker compose up -d --build
   ```

   If Docker socket access is unavailable in this shell, stop after `npm run compose:smoke` and hand the live start off to an approved shell. If the account is already in the `docker` group, a fresh shell or the `sg docker` fallback should resolve the session mismatch.

4. Check service health:

   ```bash
   docker compose ps
   curl -fsS http://localhost:4000/health
   curl -fsS http://localhost:3010/
   curl -fsS http://localhost:4100/health
   ```

5. Stop the stack:

   ```bash
   docker compose down
   ```

Use `docker compose down -v` only when you intentionally want to delete the local Postgres, Redis, and MinIO volumes.

## Service wiring

Internal service names are the API contract for local Compose:

| Service | Internal endpoint | Host endpoint | Notes |
| --- | --- | --- | --- |
| Postgres | `postgres:5432` | `localhost:5432` | Database from `POSTGRES_DB`; app DSN from `DATABASE_URL`. |
| Redis | `redis:6379` | `localhost:6379` | Queue/cache URL from `REDIS_URL`. |
| MinIO S3 API | `minio:9000` | `localhost:9000` | Artifact bucket from `MINIO_BUCKET`. |
| MinIO console | `minio:9001` | `localhost:9001` | Local console only. |
| API | `api:4000` | `localhost:4000` | Exposes `/health`; depends on Postgres, Redis, and MinIO health. |
| Web | `web:3010` | `localhost:3010` | Next.js standalone app; depends on healthy API. |
| Python worker | `worker-python:4100` | `localhost:4100` | Exposes `/health` for parser service readiness. |
| Node worker | n/a | n/a | Starts after Redis, API, and Python worker are ready. |

The `minio-init` one-shot service waits for MinIO, creates `${MINIO_BUCKET:-shore-sentinel-artifacts}`, and exits successfully. Artifact-writing services should not assume the bucket exists until this bootstrap job has completed.

If a local Postgres volume was initialized with an older password, `docker compose up` may fail API authentication even when the current Compose config is correct. For disposable local data only, reset the local state with `docker compose down -v`, then rerun `docker compose up -d --build`.

## Release verification checklist

Before handing a local build to QA or release review:

```bash
npm run compose:smoke
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/
curl -fsS http://localhost:4100/health
```

Expected result: Postgres, Redis, MinIO, API, web, node worker, and python worker are running; `minio-init` is exited with code 0; API and Python worker health endpoints return HTTP 200, and the web root returns HTTP 200.
