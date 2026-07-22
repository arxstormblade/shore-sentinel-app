#!/bin/sh
set -eu

IMAGE=${IMAGE:-shore-sentinel-single:1.1.0}
PREFIX=${PREFIX:-shore-sentinel-runtime-smoke-$(date +%s)}
CONTAINER=${PREFIX}-main
PARTIAL_CONTAINER=${PREFIX}-partial
VOLUME=${PREFIX}-data
PARTIAL_VOLUME=${PREFIX}-partial-data
POSTGRES_PASSWORD=runtime-smoke-postgres-password-1234567890
MINIO_ACCESS_KEY=runtime-smoke-minio-access
MINIO_SECRET_KEY=runtime-smoke-minio-secret-1234567890
SEED_ADMIN_PASSWORD=runtime-smoke-seed-password-1234567890
SHORE_SENTINEL_SECRET_KEY=runtime-smoke-shore-secret-1234567890
INTERNAL_WORKER_TOKEN=runtime-smoke-worker-token-1234567890
POSTGRES_DB=shore_sentinel_runtime
POSTGRES_USER=shore_sentinel
MINIO_BUCKET=shore-sentinel-runtime-artifacts

cleanup() {
  docker rm -f "$CONTAINER" "$PARTIAL_CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" "$PARTIAL_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

run_args() {
  # Keep the real password inside the disposable container environment; do
  # not log this command or substitute a redaction marker into the URL.
  docker run \
    --read-only --tmpfs /run --tmpfs /tmp \
    --cap-drop ALL --cap-add CHOWN --cap-add SETGID --cap-add SETUID \
    --security-opt no-new-privileges:true --pids-limit 256 --memory 4g --cpus 4 \
    -e NODE_ENV=production -e PORT=4000 -e WEB_PORT=3010 \
    -e POSTGRES_DB="$POSTGRES_DB" -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}" \
    -e REDIS_URL=redis://127.0.0.1:6379/0 -e MINIO_ENDPOINT=http://127.0.0.1:9000 \
    -e MINIO_BUCKET="$MINIO_BUCKET" -e MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" \
    -e MINIO_SECRET_KEY="$MINIO_SECRET_KEY" -e SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" \
    -e SHORE_SENTINEL_SECRET_KEY="$SHORE_SENTINEL_SECRET_KEY" \
    -e INTERNAL_WORKER_TOKEN="$INTERNAL_WORKER_TOKEN" -e API_URL=http://127.0.0.1:4000 \
    -e PYTHON_WORKER_URL=http://127.0.0.1:4100 -e PYTHON_WORKER_PORT=4100 \
    -e WORKER_CONCURRENCY=1 -e WORKER_MAX_ATTEMPTS=3 -e WORKER_BACKOFF_MS=5000 \
    "$@"
}

command -v docker >/dev/null
docker image inspect "$IMAGE" >/dev/null 2>&1
docker volume create "$PARTIAL_VOLUME" >/dev/null
docker run --rm -v "$PARTIAL_VOLUME:/var/lib/shore-sentinel" --entrypoint /bin/sh "$IMAGE" -c \
  'set -eu; mkdir -p /var/lib/shore-sentinel/postgres/partial; printf interrupted > /var/lib/shore-sentinel/postgres/partial/state; chown -R shore-postgres:shore-postgres /var/lib/shore-sentinel/postgres'

docker volume create "$VOLUME" >/dev/null
run_args -d --name "$CONTAINER" -v "$VOLUME:/var/lib/shore-sentinel" "$IMAGE" >/dev/null
for attempt in $(seq 1 90); do
  if docker exec "$CONTAINER" /opt/shore-sentinel/bin/healthcheck.sh >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 90 ] || { docker logs "$CONTAINER"; exit 1; }
  sleep 2
done

docker exec "$CONTAINER" /opt/shore-sentinel/bin/capability-check.sh
test "$(docker inspect -f '{{len .Mounts}}' "$CONTAINER")" = 1
test "$(docker inspect -f '{{(index .Mounts 0).Name}}' "$CONTAINER")" = "$VOLUME"
test "$(docker volume inspect -f '{{.Name}}' "$VOLUME")" = "$VOLUME"
test "$(docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}}' | wc -l)" = 1
test "$(docker exec "$CONTAINER" supervisorctl status | awk '$2 == "RUNNING" { count++ } END { print count + 0 }')" = 7
owner=$(docker exec "$CONTAINER" sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -h 127.0.0.1 -U \"\$POSTGRES_USER\" -d postgres -Atqc \"SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '\$POSTGRES_DB'\"")
test "$owner" = "$POSTGRES_USER"
migration_rows=$(docker exec "$CONTAINER" sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -h 127.0.0.1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atqc 'SELECT concat(version, chr(58), checksum) FROM schema_migrations ORDER BY version'")
expected_migrations=$(docker exec --user shore-api "$CONTAINER" sh -c 'for file in /opt/shore-sentinel/api/migrations/*.sql; do version=$(basename "$file" | cut -d_ -f1); printf "%s:" "$version"; sha256sum "$file" | awk "{print \$1}"; done')
test "$migration_rows" = "$expected_migrations"
test "$(printf '%s\n' "$migration_rows" | wc -l)" = 4
docker exec --user shore-api "$CONTAINER" node /opt/shore-sentinel/bin/object-storage-bootstrap.mjs
printf '%s\n' 'authenticated object-storage bootstrap passed'
test "$(docker exec "$CONTAINER" sh -c 'curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:9000/$MINIO_BUCKET"')" = 403
printf '%s\n' 'anonymous object-storage probe passed'
if docker exec --user shore-api "$CONTAINER" sh -c 'unset PGPASSWORD; psql -w -h 127.0.0.1 -U "$POSTGRES_USER" -d postgres -Atc "SELECT 1"' >/dev/null 2>&1; then
  echo "co-resident user connected without database credentials" >&2
  exit 1
fi
printf '%s\n' 'co-resident database authentication rejection passed'

docker exec --user shore-parser "$CONTAINER" sh -c 'printf persisted > /var/lib/shore-sentinel/evidence/runtime-persistence-marker'
printf '%s\n' 'persistence marker write passed'
docker exec "$CONTAINER" sh -c 'ps -o args | awk '\''$0 ~ /^postgres -D/ { count++ } END { print count + 0 }'\'' | grep -qx 1'
printf '%s\n' 'postgres duplicate-process check passed'
docker exec "$CONTAINER" sh -c 'ps -o args | awk '\''$0 ~ /^redis-server / { count++ } END { print count + 0 }'\'' | grep -qx 1'
printf '%s\n' 'redis duplicate-process check passed'
docker exec "$CONTAINER" sh -c 'ps -o args | awk '\''$0 ~ /^minio server / { count++ } END { print count + 0 }'\'' | grep -qx 1'
printf '%s\n' 'minio duplicate-process check passed'
supervisor_processes=$(docker exec "$CONTAINER" sh -c "ps -o args | grep -E -c '^[{]supervisord[}] '")
printf 'supervisor process count: %s\n' "$supervisor_processes"
test "$supervisor_processes" = 1
printf '%s\n' 'supervisor duplicate-process check passed'
docker exec "$CONTAINER" redis-cli -h 127.0.0.1 set shore-sentinel:backup-marker persisted >/dev/null
docker exec "$CONTAINER" /opt/shore-sentinel/bin/backup-restore.sh backup /tmp/runtime-backup
docker exec "$CONTAINER" /opt/shore-sentinel/bin/backup-restore.sh rollback /tmp/runtime-backup >/dev/null
printf '%s\n' 'backup and rollback primitives passed'
docker exec "$CONTAINER" redis-cli -h 127.0.0.1 set shore-sentinel:backup-marker mutated >/dev/null
docker exec --user shore-parser "$CONTAINER" rm -f /var/lib/shore-sentinel/evidence/runtime-persistence-marker
docker exec "$CONTAINER" /opt/shore-sentinel/bin/backup-restore.sh restore /tmp/runtime-backup
docker exec "$CONTAINER" test -s /var/lib/shore-sentinel/evidence/runtime-persistence-marker
test "$(docker exec "$CONTAINER" redis-cli -h 127.0.0.1 get shore-sentinel:backup-marker)" = persisted
printf '%s\n' 'backup restore primitive passed'

docker stop -t 45 "$CONTAINER" >/dev/null
docker start "$CONTAINER" >/dev/null
for attempt in $(seq 1 90); do
  if docker exec "$CONTAINER" /opt/shore-sentinel/bin/healthcheck.sh >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 90 ] || { docker logs "$CONTAINER"; exit 1; }
  sleep 2
done
docker exec "$CONTAINER" /opt/shore-sentinel/bin/capability-check.sh
docker exec "$CONTAINER" test -s /var/lib/shore-sentinel/evidence/runtime-persistence-marker
docker exec "$CONTAINER" sh -c "PGPASSWORD=\"\$POSTGRES_PASSWORD\" psql -h 127.0.0.1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atqc 'SELECT count(*) FROM schema_migrations' | grep -qx 4"
docker rm -f "$CONTAINER" >/dev/null
docker volume rm "$PARTIAL_VOLUME" "$VOLUME" >/dev/null
printf '%s\n' 'single-container runtime smoke passed'
