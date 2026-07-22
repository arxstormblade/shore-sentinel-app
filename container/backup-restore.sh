#!/bin/sh
set -eu
umask 077

DATA_ROOT=${SHORE_SENTINEL_DATA_ROOT:-/var/lib/shore-sentinel}
REDIS_CONFIG=${REDIS_CONFIG:-/run/shore-sentinel-redis.conf}
MODE=${1:-}
BACKUP_DIR=${2:?usage: backup-restore.sh backup|restore|rollback <directory>}

usage() {
  echo "usage: backup-restore.sh backup|restore|rollback <directory>" >&2
  exit 64
}

set_redis_appendonly() {
  value=$1
  from=yes
  [ "$value" = yes ] && from=no
  temporary=/run/shore-sentinel-redis.restore.conf
  : > "$temporary"
  chmod 0644 "$temporary"
  chown shore-redis:shore-redis "$temporary"
  su-exec shore-redis sh -c 'sed "s/^appendonly $1$/appendonly $2/" "$3" > "$4"' sh "$from" "$value" "$REDIS_CONFIG" "$temporary"
  mv "$temporary" "$REDIS_CONFIG"
}

[ -n "$MODE" ] || usage
mkdir -p "$BACKUP_DIR"

case "$MODE" in
  backup)
    : "${DATABASE_URL:?DATABASE_URL must be set}"
    pg_dump --format=custom --file="$BACKUP_DIR/postgres.dump" "$DATABASE_URL"
    redis-cli -h 127.0.0.1 --rdb "$BACKUP_DIR/redis.rdb" >/dev/null
    tar -C "$DATA_ROOT" -czf "$BACKUP_DIR/object-and-evidence.tgz" object-storage evidence
    printf '%s\n' "shore-sentinel backup" "schema=$(psql "$DATABASE_URL" -Atqc 'SELECT max(version) FROM schema_migrations')" "created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BACKUP_DIR/metadata.txt"
    (cd "$BACKUP_DIR" && sha256sum postgres.dump redis.rdb object-and-evidence.tgz metadata.txt > manifest.sha256)
    ;;
  restore)
    : "${DATABASE_URL:?DATABASE_URL must be set}"
    (cd "$BACKUP_DIR" && sha256sum -c manifest.sha256)
    pg_restore --clean --if-exists --dbname="$DATABASE_URL" "$BACKUP_DIR/postgres.dump"
    # CAP_DAC_OVERRIDE is intentionally absent. Restore each private tree as
    # its owning service user so tar can replace service-owned files without
    # requiring a broader capability or recursive root chown. MinIO must be
    # stopped before replacing its live metadata tree; supervisorctl cannot
    # signal a different service user without CAP_KILL, so ask MinIO's own
    # identity to terminate its process and wait for it to exit.
    minio_pid=$(supervisorctl pid shore-sentinel:minio 2>/dev/null || true)
    if [ -n "$minio_pid" ]; then
      su-exec shore-minio kill -TERM "$minio_pid" 2>/dev/null || true
      i=0
      while ps -o pid= | tr -d ' ' | grep -qx "$minio_pid"; do
        i=$((i + 1))
        [ "$i" -lt 30 ] || { echo "object storage did not stop before restore" >&2; exit 1; }
        sleep 1
      done
    fi
    su-exec shore-minio tar -C "$DATA_ROOT" -xzf - object-storage < "$BACKUP_DIR/object-and-evidence.tgz"
    su-exec shore-parser tar -C "$DATA_ROOT" -xzf - evidence < "$BACKUP_DIR/object-and-evidence.tgz"
    supervisorctl start shore-sentinel:minio >/dev/null
    i=0
    while ! curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null 2>&1; do
      i=$((i + 1))
      [ "$i" -lt 60 ] || { echo "object storage did not become ready after restore" >&2; exit 1; }
      sleep 1
    done
    # Redis must be stopped before replacing its RDB/AOF state. The service
    # user owns the private tree, so no extra DAC capability is needed.
    # supervisor cannot signal a service user without CAP_KILL; ask Redis to
    # shut itself down through its authenticated local control interface.
    redis-cli -h 127.0.0.1 shutdown nosave >/dev/null
    su-exec shore-redis sh -c 'rm -rf "$1"/* "$1"/.[!.]* "$1"/..?*' sh "$DATA_ROOT/redis"
    su-exec shore-redis sh -c 'cat > "$1/dump.rdb"' sh "$DATA_ROOT/redis" < "$BACKUP_DIR/redis.rdb"
    # Redis 7 prefers an append-only manifest over dump.rdb. Temporarily
    # disable AOF for the first start so the restored RDB is loaded, then
    # enable it in-place after the restored keys are available.
    set_redis_appendonly no
    supervisorctl start shore-sentinel:redis >/dev/null
    i=0
    while ! redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -qx PONG; do
      i=$((i + 1))
      [ "$i" -lt 30 ] || { echo "redis did not become ready after restore" >&2; exit 1; }
      sleep 1
    done
    # Enable AOF in-place after the RDB is loaded so Redis snapshots the
    # restored keys instead of starting a second time from a fresh manifest.
    redis-cli -h 127.0.0.1 config set appendonly yes >/dev/null
    set_redis_appendonly yes
    ;;
  rollback)
    [ -f "$BACKUP_DIR/manifest.sha256" ] || { echo "backup manifest required for rollback" >&2; exit 65; }
    (cd "$BACKUP_DIR" && sha256sum -c manifest.sha256)
    echo "rollback primitive verified backup $BACKUP_DIR; restore it, then restart the previously approved image"
    ;;
  *)
    usage
    ;;
esac
