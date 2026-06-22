# Shore Sentinel docs

Use this directory for app-specific implementation notes, runbooks, and operator documentation.

## Local Compose runbook

The root `docker-compose.yml` is the source of truth for local development. It includes:

- stateful dependencies: `postgres`, `redis`, `minio`
- app surfaces: `api`, `web`
- async processors: `worker-node`, `worker-python`
- bootstrap job: `minio-init`

### Bootstrap behavior

`minio-init` uses the MinIO client image to create the configured artifact bucket at startup. It is safe to re-run; bucket creation is idempotent. Services that write artifacts should depend on `minio-init` instead of raw `minio` startup when they require the bucket to exist.

### Health expectations

- Postgres: `pg_isready` must pass before dependent services start.
- Redis: `redis-cli ping` must pass before dependent services start.
- MinIO: `mc ready local` must pass before `minio-init` runs.
- API: `/health` returns HTTP 200 from inside the container health check and host verification.
- Web: `/` returns HTTP 200; the standalone server is bound to `0.0.0.0` for container and host health checks.
- Python worker: `/health` returns HTTP 200.
- Node worker: starts after Redis, API, and Python worker are ready and logs the queue name plus internal Redis URL.

### Validation commands

```bash
npm run compose:smoke
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/
curl -fsS http://localhost:4100/health
```

`npm run compose:smoke` is socket-aware: it tries Docker Compose, retries through `sg docker` when the account is already in the `docker` group but the current shell is stale, and skips cleanly only when Docker access is genuinely unavailable.

If `docker compose up` fails API authentication after a password change, an existing local Postgres volume may have been initialized with older credentials. Use `docker compose down -v` only for disposable local data, then rebuild the stack.

If Docker reports permission denied on `/var/run/docker.sock`, use `npm run compose:smoke` for a socket-aware skip/pass check in restricted shells. If the account is already in the `docker` group but the shell is stale, start a fresh login shell or use the helper’s `sg docker` fallback. For a real live Compose start, run from a shell with Docker daemon access and group membership already active.
