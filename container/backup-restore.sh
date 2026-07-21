#!/bin/sh
set -eu
umask 077

DATA_ROOT=${SHORE_SENTINEL_DATA_ROOT:-/var/lib/shore-sentinel}
BACKUP_DIR=${1:?usage: backup-restore.sh backup|restore|rollback <directory>}
MODE=${2:-}

usage() {
  echo "usage: backup-restore.sh <backup|restore|rollback> <directory>" >&2
  exit 64
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
    tar -C "$DATA_ROOT" -xzf "$BACKUP_DIR/object-and-evidence.tgz"
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
