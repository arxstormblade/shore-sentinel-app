# Single-container backup, restore, and rollback

This runbook is a local/disposable operator procedure. It never mounts the Docker socket into the application container and never stores raw target secrets in the backup.

## Backup

1. Quiesce new work and wait for the container healthcheck to be healthy.
2. Create an access-separated, encrypted destination outside the application-data volume. The destination must preserve retention/legal-hold policy.
3. Run inside the approved container identity:

```sh
/opt/shore-sentinel/bin/backup-restore.sh backup /secure/off-volume/shore-sentinel-<timestamp>
```

The command runs `pg_dump --format=custom`, captures a PostgreSQL custom dump, Redis RDB, object-storage/evidence data, schema identity, and a SHA-256 manifest. Encrypt the directory with the approved KMS/OpenBao/Vault envelope; retain only the key/config identity, not plaintext credentials.

## Restore drill

restore into a fresh empty volume (a new named volume), never over an unverified live volume:

```sh
/opt/shore-sentinel/bin/backup-restore.sh restore /secure/off-volume/shore-sentinel-<timestamp>
```

The script verifies `manifest.sha256` before `pg_restore` or extracting object/evidence data. Re-run migrations, check the evidence hash inventory and external checkpoint, then verify API, web, PostgreSQL, Redis, MinIO, both workers, and the critical authenticated flow. Record RPO/RTO, image digest, configuration identity, reviewer, and the KMS key/config identity.

## Rollback primitive

A rollback requires an approved prior signed image/config and a verified backup. The application container must not decide which image to run and must not access Docker:

```sh
/opt/shore-sentinel/bin/backup-restore.sh rollback /secure/off-volume/shore-sentinel-<timestamp>
docker compose up -d --no-build shore-sentinel
```

Use `docker compose down` without `-v` for routine rollback. Never use `down -v` during update or rollback. If migrations are not backward-compatible, restore the recorded database/object/evidence backup into a fresh volume before starting the prior image. A failed readiness check, integrity/checkpoint mismatch, unauthorized egress, or secret-boundary failure is a rollback trigger.
