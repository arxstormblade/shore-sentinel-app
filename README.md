<p align="center">
  <img src="docs/assets/shore-sentinel-logo-transparent.png" alt="Shore Sentinel logo" width="120">
</p>

# Shore Sentinel

Managed-machine security posture monitoring, inventory, remediation, and reporting — with a standalone one-time local audit option for machines that should not be enrolled.

Shore Sentinel has two supported usage paths:

1. **One-Time Audit** — pull the scanner bundle from GitHub and run it locally on a client machine. Reports and artifacts stay on the client machine.
2. **App Deployment** — install the full Shore Sentinel control plane with Docker Compose for managed-machine monitoring, recurring scan history, dashboards, and remediation tracking.

---

## Option 1 — One-Time Audit (pull the scanner script)

Use this when you need quick evidence from a single machine without enrolling it into Shore Sentinel managed monitoring.

### What this does

- Pulls the scanner bundle from the Shore Sentinel GitHub repository.
- Runs the read-only scanner locally on the client machine.
- Saves JSON, Markdown, SARIF, PDF, and supporting artifacts locally.
- Does **not** upload reports to Shore Sentinel by default.
- Does **not** create a managed machine record.

### Prerequisites

Install these on the client machine:

- Git
- Python 3.10+

Verify:

```bash
git --version
python3 --version
```

### Run the local audit

```bash
git clone --depth 1 --branch v0.3.10 https://github.com/arxstormblade/shore-sentinel-app.git
cd shore-sentinel-app
python3 scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py \
  --target . \
  --out-dir ./shore-sentinel-local-audit-reports \
  --exit-zero
```

To audit a different local path, change `--target`:

```bash
python3 scanner-bundle/bin/Agent_Security_Selfcheck_v3.4.0.py \
  --target /path/to/audit \
  --out-dir ./shore-sentinel-local-audit-reports \
  --exit-zero
```

### Output location

Reports and artifacts stay on the client machine:

```text
./shore-sentinel-local-audit-reports
```

Handle this folder as sensitive evidence. It may include hostnames, system inventory, package versions, findings, and remediation guidance.

### When to use this option

Use one-time local audit for:

- vendor-owned machines
- offline or temporary endpoints
- quick evidence collection
- client machines that should not be enrolled
- environments where artifacts must stay local unless explicitly shared

Use **App Deployment** instead if you need ongoing monitoring, dashboards, recurring scan history, and remediation tracking.

---

## Option 2 — App Deployment (install Shore Sentinel into Docker)

Use this when you want the full Shore Sentinel application for managed-machine monitoring.

### What this does

The Docker Compose app provides:

- Postgres for application state
- Redis for queue/cache coordination
- MinIO for managed scan artifacts and generated reports
- Node.js API on `http://localhost:4000`
- Next.js web app on `http://localhost:3010/shore-sentinel`
- Node worker for scan orchestration jobs
- Python worker for parsing, normalization, and report enrichment

### Prerequisites

Install these on the host:

- Git
- Docker Engine
- Docker Compose v2

Verify:

```bash
git --version
docker --version
docker compose version
```

### 1. Clone the repository

```bash
git clone https://github.com/arxstormblade/shore-sentinel-app.git
cd shore-sentinel-app
```

### 2. Configure environment values

Copy the sample environment file:

```bash
cp .env.example .env
```

Edit `.env` and replace every `replace-me` value before using real or customer data:

```bash
nano .env
```

At minimum, set strong values for:

```text
POSTGRES_PASSWORD
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
SEED_ADMIN_PASSWORD
SHORE_SENTINEL_SECRET_KEY
SESSION_COOKIE_SECRET
```

### 3. Validate the Compose model

```bash
npm run compose:smoke
```

If Docker daemon access is available, the helper runs `docker compose config` and `docker compose ps`. If the socket is unavailable in the current shell, fix Docker group/session access before starting the stack.

### 4. Start Shore Sentinel

```bash
docker compose up -d --build
```

### 5. Check service health

```bash
docker compose ps
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/shore-sentinel
curl -fsS http://localhost:4100/health
```

Open the web app:

```text
http://localhost:3010/shore-sentinel
```

### 6. Stop the stack

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete the local Postgres, Redis, and MinIO volumes.

---

## Main app focus: managed machine monitoring

The deployed app is optimized for enrolled machines:

- managed inventory
- SSH-push or pull-check-in connection modes
- scheduled and manual scan jobs
- last seen / stale machine tracking
- scan history by machine
- findings and remediation ownership
- dashboard and fleet reporting

A one-time local audit is intentionally separate. It produces local evidence and does not become part of fleet health unless a future import workflow is used.

---

## Updating Shore Sentinel

Shore Sentinel supports two update paths.

### Option A: Manual command-line update, recommended default

From the Git checkout:

```bash
cd shore-sentinel-app
git fetch origin main
git status --short
git pull --ff-only origin main
docker compose up -d --build
```

Verify after updating:

```bash
docker compose ps
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/shore-sentinel
```

If `git pull --ff-only` fails, the local checkout has diverged or contains local changes. Resolve that manually before updating.

### Option B: In-app System Update feature

The app includes an admin-only **System Update** page:

```text
/shore-sentinel/system/update
```

By default, self-update is disabled because enabling it gives the API container access to the Git checkout and Docker socket. Enable it only on trusted single-tenant installations.

To enable in-app updates:

```bash
cd shore-sentinel-app
cp docker-compose.update.example.yml docker-compose.update.yml
docker compose -f docker-compose.yml -f docker-compose.update.example.yml up -d --build
```

Then sign in as an admin and open:

```text
http://localhost:3010/shore-sentinel/system/update
```

Available actions:

- **Check for updates** — fetches `origin/main`, reports pending commits, and does not restart services.
- **Apply update** — creates a backup branch, fast-forwards to `origin/main`, rebuilds containers, and restarts the Compose stack.

The updater refuses to run if the checkout has uncommitted changes unless this environment variable is explicitly set:

```text
SHORE_SENTINEL_UPDATE_ALLOW_DIRTY=true
```

Use that override only if you understand that local changes may be overwritten or conflict with upstream updates.

---

## Service wiring

Internal service names are the API contract for local Compose:

| Service | Internal endpoint | Host endpoint | Notes |
| --- | --- | --- | --- |
| Postgres | `postgres:5432` | `localhost:5432` | Database from `POSTGRES_DB`; app DSN from `DATABASE_URL`. |
| Redis | `redis:6379` | `localhost:6379` | Queue/cache URL from `REDIS_URL`. |
| MinIO S3 API | `minio:9000` | `localhost:9000` | Artifact bucket from `MINIO_BUCKET`. |
| MinIO console | `minio:9001` | `localhost:9001` | Local console only. |
| API | `api:4000` | `localhost:4000` | Exposes `/health`; depends on Postgres, Redis, and MinIO health. |
| Web | `web:3010` | `localhost:3010` | Next.js standalone app under `/shore-sentinel`; depends on healthy API. |
| Python worker | `worker-python:4100` | `localhost:4100` | Exposes `/health` for parser service readiness. |
| Node worker | n/a | n/a | Starts after Redis, API, and Python worker are ready. |

The `minio-init` one-shot service waits for MinIO, creates `${MINIO_BUCKET:-shore-sentinel-artifacts}`, and exits successfully. Artifact-writing services should not assume the bucket exists until this bootstrap job has completed.

---

## Release verification checklist

Before handing a build to QA or release review:

```bash
npm run compose:smoke
npm --workspace @shore-sentinel/api test
docker build --network=host -f api/Dockerfile -t shore-sentinel-api .
docker build --network=host -f web/Dockerfile -t shore-sentinel-web .
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/shore-sentinel
curl -fsS http://localhost:4100/health
```

Expected result: Postgres, Redis, MinIO, API, web, node worker, and python worker are running; `minio-init` is exited with code 0; API and Python worker health endpoints return HTTP 200, and the web route returns HTTP 200.
