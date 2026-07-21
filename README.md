<p align="center">
  <img src="docs/assets/shore-sentinel-logo-transparent.png" alt="Shore Sentinel logo" width="120">
</p>

# Shore Sentinel

Managed-machine security posture monitoring, inventory, remediation, and reporting — with a standalone one-time local audit option for machines that should not be enrolled.

## Graphify navigation

Use Graphify before broad code exploration or cross-cutting changes. Refresh the local,
untracked graph with `npm run graphify:refresh`, then ask a focused question from the
repository root, for example: `graphify query "How are API scan jobs processed?"`.
Generated artifacts live in `graphify-out/` and are intentionally ignored; its
`FRESHNESS.json` records the source HEAD, generation time, CLI version, and graph counts.

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

Until v1.1.0 is promoted, clone the reviewed default branch (or an approved immutable commit SHA). The release tag is created only at promotion after CI, security review, QA evidence, and staged rollback validation are approved; do not use an uncreated tag in installation instructions.

```bash
git clone --depth 1 https://github.com/arxstormblade/shore-sentinel-app.git
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

The Docker Compose app provides exactly one `shore-sentinel` application container. A fixed supervisor runs the web UI, API, PostgreSQL, Redis, MinIO object storage, Node orchestration/managed-SSH worker, and Python parser/normalization worker as separate, least-privilege processes inside that container. One named `shore-sentinel-data` volume is mounted at `/var/lib/shore-sentinel` with internal `postgres`, `redis`, `object-storage`, and `evidence` directories. The container does not mount the Docker socket or host SSH keys.

The deployment boundary publishes:

- Node.js API health endpoint at `http://localhost:4000/health`
- Next.js web app at `http://localhost:3010/shore-sentinel`

Database, queue, object-storage, and worker control ports remain loopback-only inside the application container. Managed SSH and AI test execution retain host-key, target-scope, bounded-cancellation, approval, and independent egress controls; disposable AI tests use bounded unprivileged process/user/namespace sandboxes inside the application container.

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

### 5. Check application health

```bash
docker compose ps
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/shore-sentinel
```

Open the web app:

```text
http://localhost:3010/shore-sentinel
```

### 6. Stop the stack

```bash
docker compose down
```

Use `docker compose down -v` only when you intentionally want to delete the complete `shore-sentinel-data` volume. It is not a routine update or rollback command.

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

### Managed-machine scan directory

For an enrolled managed machine using the SSH-push connection mode, the machine page offers **Directory to scan** before a new scan is launched. This is the managed equivalent of the one-time-audit `--target` option: it scopes the packaged scanner on the enrolled remote machine, not inside the Shore Sentinel application container. The selected directory is recorded with that scan’s evidence and cannot be changed after launch; stop the active scan and launch a new one to use a different directory.

---

## Updating Shore Sentinel

The update path is currently **unavailable in this planning baseline**. Do not run `git pull origin main`, update from a mutable branch, or rebuild an unverified checkout over persistent data. An update becomes available only when the signed update integration and the backup/restore runbook have passed review.

The approved release sequence must, in this order, verify a signed immutable commit/tag and image/test-bundle signatures against pinned signer identities and trust roots, verify revocation, anti-rollback policy, and provenance-to-SBOM linkage, quiesce the application, create an encrypted access-separated off-volume backup, apply compatible migrations under an advisory lock, record image/config/volume/checkpoint identity, and verify every process plus the critical flow. Unsigned, tampered, wrong-signer, revoked, stale, or older-than-approved candidates must be rejected.

Routine stop/rollback must not delete the one application-data volume:

```bash
docker compose down
```

The historical `docker-compose.update.example.yml` override is not part of the single-container release baseline and must never be enabled: it grants Docker-socket and host-workspace access that the approved architecture forbids. The admin-only **System Update** page at `/shore-sentinel/system/update` remains a disabled placeholder until it provides the same signed-artifact, backup, authorization, and rollback guarantees; it must fail closed rather than offer a mutable-main update.

### Data protection before an approved update

Backups must be encrypted, access-separated, and stored outside `/var/lib/shore-sentinel`. The backup procedure quiesces new work, checkpoints the signed evidence ledger, flushes Redis/outbox state, captures PostgreSQL and object-storage state, preserves Object Lock/legal holds, records RPO/RTO, and proves restore into a fresh empty volume with database/object/evidence reconciliation. KMS/key and configuration recovery must be recorded without copying raw target secrets into the backup. See `docs/runbooks/single-container-backup-restore.md` once the implementation task creates and verifies it.

---

## Application process wiring

Production Compose has one `shore-sentinel` service and one `shore-sentinel-data` volume. The supervisor starts the process graph in dependency order: PostgreSQL and Redis, MinIO and its private bucket bootstrap, ordered migrations, API, Python worker, Node worker, and web. Internal process endpoints are loopback-only and are not separate Compose services:

| Process | Internal endpoint/data path | Host endpoint | Notes |
| --- | --- | --- | --- |
| PostgreSQL | `127.0.0.1:5432` / `/var/lib/shore-sentinel/postgres` | not published | Authoritative application state. |
| Redis | `127.0.0.1:6379` / `/var/lib/shore-sentinel/redis` | not published | Bounded queue/cache coordination. |
| MinIO S3 API | `127.0.0.1:9000` / `/var/lib/shore-sentinel/object-storage` | not published | Private artifact bucket. |
| API | `127.0.0.1:4000` | `localhost:4000` | Exposes `/health`; reports dependency and supervisor readiness. |
| Web | `127.0.0.1:3010` | `localhost:3010` | Next.js app under `/shore-sentinel`. |
| Python worker | `127.0.0.1:4100` | not published | Parser/normalization readiness is checked by the supervisor. |
| Node worker | supervisor-managed | not published | Orchestration and managed-SSH adapter; sole managed-target SSH process path. |

The one named volume is the persistence boundary. Back up PostgreSQL, Redis state, object-storage contents, and evidence hashes before upgrades; routine stop and rollback commands must not delete it.

---

## Release verification checklist

Before handing a build to QA or release review:

```bash
npm run compose:smoke
npm --workspace @shore-sentinel/api test
docker compose ps
curl -fsS http://localhost:4000/health
curl -fsS http://localhost:3010/shore-sentinel
```

Expected result: exactly one `shore-sentinel` application container is running; its supervisor reports PostgreSQL, Redis, MinIO, API, web, Node worker, and Python worker healthy; API and web return HTTP 200; and the `shore-sentinel-data` volume remains attached.
