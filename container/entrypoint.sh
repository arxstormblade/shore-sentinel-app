#!/bin/sh
set -eu

DATA_ROOT=${SHORE_SENTINEL_DATA_ROOT:-/var/lib/shore-sentinel}
export PGDATA="$DATA_ROOT/postgres"
export REDIS_CONFIG=/run/shore-sentinel-redis.conf
export MINIO_DATA_DIR="$DATA_ROOT/object-storage"
export PYTHON_WORKER_PORT=${PYTHON_WORKER_PORT:-4100}
export WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-1}
export WORKER_MAX_ATTEMPTS=${WORKER_MAX_ATTEMPTS:-3}
export WORKER_BACKOFF_MS=${WORKER_BACKOFF_MS:-5000}
export API_URL=${API_URL:-http://127.0.0.1:4000}
export PYTHON_WORKER_URL=${PYTHON_WORKER_URL:-http://127.0.0.1:4100}
export MINIO_ENDPOINT=${MINIO_ENDPOINT:-http://127.0.0.1:9000}
export MINIO_BUCKET=${MINIO_BUCKET:-shore-sentinel-artifacts}
export POSTGRES_DB=${POSTGRES_DB:-shore_sentinel}
export POSTGRES_USER=${POSTGRES_USER:-shore_sentinel}
export PORT=${PORT:-4000}
export WEB_PORT=${WEB_PORT:-3010}

: "${DATABASE_URL:?DATABASE_URL must be set}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}"
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY must be set}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY must be set}"
: "${SHORE_SENTINEL_SECRET_KEY:?SHORE_SENTINEL_SECRET_KEY must be set}"
: "${INTERNAL_WORKER_TOKEN:?INTERNAL_WORKER_TOKEN must be set}"

case "$POSTGRES_DB" in
  ''|*[!A-Za-z0-9_]*|[0-9]*) echo "POSTGRES_DB must be a simple SQL identifier" >&2; exit 64 ;;
esac
case "$POSTGRES_USER" in
  ''|*[!A-Za-z0-9_]*|[0-9]*) echo "POSTGRES_USER must be a simple SQL identifier" >&2; exit 64 ;;
esac

mkdir -p /run/postgresql "$DATA_ROOT/postgres" "$DATA_ROOT/redis" "$DATA_ROOT/object-storage" "$DATA_ROOT/evidence"
chown shore-postgres:shore-postgres /run/postgresql
# Only the top-level volume directories are privileged bootstrap state. Their
# service owners create and maintain descendants, so restart never needs root
# to traverse private database/object files without CAP_DAC_OVERRIDE.
chown shore-postgres:shore-postgres "$DATA_ROOT/postgres"
chown shore-redis:shore-redis "$DATA_ROOT/redis"
chown shore-minio:shore-minio "$DATA_ROOT/object-storage"
chown shore-parser:shore-parser "$DATA_ROOT/evidence"

password_file=/run/shore-sentinel-postgres-password
cleanup_bootstrap_password() {
  rm -f "${password_file:-}"
}
trap cleanup_bootstrap_password EXIT INT TERM

if ! su-exec shore-postgres test -s "$PGDATA/PG_VERSION"; then
  if su-exec shore-postgres find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    # An interrupted initdb may leave an owned, partial cluster. Remove only
    # that incomplete cluster as the database user; never touch a valid one.
    su-exec shore-postgres sh -c 'find "$1" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +' sh "$PGDATA"
  fi
  umask 077
  printf '%s' "$POSTGRES_PASSWORD" > "$password_file"
  chown shore-postgres:shore-postgres "$password_file"
  su-exec shore-postgres initdb --auth-local=scram-sha-256 --auth-host=scram-sha-256 --username="${POSTGRES_USER:-shore_sentinel}" --pwfile="$password_file" -D "$PGDATA" >/dev/null
fi
cleanup_bootstrap_password
password_file=
cat > "$REDIS_CONFIG" <<EOF
bind 127.0.0.1
port 6379
dir $DATA_ROOT/redis
appendonly yes
protected-mode yes
EOF
chown shore-redis:shore-redis "$REDIS_CONFIG"

cleanup_bootstrap() {
  if [ -n "${MINIO_PID:-}" ]; then
    su-exec shore-minio kill "$MINIO_PID" 2>/dev/null || true
    wait "$MINIO_PID" 2>/dev/null || true
  fi
  redis-cli -h 127.0.0.1 shutdown nosave 2>/dev/null || true
  su-exec shore-postgres pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
}
trap cleanup_bootstrap EXIT INT TERM

umask 022
: > /run/shore-sentinel-postgres.log
chown shore-postgres:shore-postgres /run/shore-sentinel-postgres.log
su-exec shore-postgres pg_ctl -D "$PGDATA" -l /run/shore-sentinel-postgres.log -o "-c listen_addresses=127.0.0.1 -p 5432 -c unix_socket_directories=/run/postgresql" -w start >/dev/null || { cat /run/shore-sentinel-postgres.log >&2; exit 1; }
su-exec shore-redis redis-server "$REDIS_CONFIG" --daemonize yes
su-exec shore-minio env MINIO_ROOT_USER="$MINIO_ACCESS_KEY" MINIO_ROOT_PASSWORD="$MINIO_SECRET_KEY" minio server "$MINIO_DATA_DIR" --address 127.0.0.1:9000 >/dev/null 2>&1 &
MINIO_PID=$!

wait_for() {
  name=$1
  shift
  i=0
  while [ "$i" -lt 60 ]; do
    if "$@" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  echo "bootstrap dependency did not become ready: $name" >&2
  return 1
}

wait_for postgres pg_isready -h 127.0.0.1 -p 5432
wait_for redis redis-cli -h 127.0.0.1 ping
wait_for minio curl -fsS http://127.0.0.1:9000/minio/health/live

ensure_postgres_database() {
  if ! su-exec shore-postgres env PGPASSWORD="$POSTGRES_PASSWORD" psql --username="$POSTGRES_USER" --dbname=postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'" | grep -qx 1; then
    su-exec shore-postgres env PGPASSWORD="$POSTGRES_PASSWORD" createdb --username="$POSTGRES_USER" --owner="$POSTGRES_USER" "$POSTGRES_DB"
  fi
  owner=$(su-exec shore-postgres env PGPASSWORD="$POSTGRES_PASSWORD" psql --username="$POSTGRES_USER" --dbname=postgres -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$POSTGRES_DB'")
  if [ "$owner" != "$POSTGRES_USER" ]; then
    su-exec shore-postgres env PGPASSWORD="$POSTGRES_PASSWORD" psql --username="$POSTGRES_USER" --dbname=postgres -Atqc "ALTER DATABASE \"$POSTGRES_DB\" OWNER TO \"$POSTGRES_USER\""
  fi
  owner=$(su-exec shore-postgres env PGPASSWORD="$POSTGRES_PASSWORD" psql --username="$POSTGRES_USER" --dbname=postgres -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = '$POSTGRES_DB'")
  [ "$owner" = "$POSTGRES_USER" ] || { echo "configured PostgreSQL database has unexpected owner" >&2; return 1; }
}

ensure_postgres_database
su-exec shore-api env -i PATH="$PATH" MINIO_ENDPOINT="$MINIO_ENDPOINT" MINIO_BUCKET="$MINIO_BUCKET" MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" MINIO_SECRET_KEY="$MINIO_SECRET_KEY" node /opt/shore-sentinel/bin/object-storage-bootstrap.mjs
su-exec shore-api env -i PATH="$PATH" NODE_ENV="${NODE_ENV:-production}" DATABASE_URL="$DATABASE_URL" shore-sentinel migrate
su-exec shore-api env -i PATH="$PATH" DATABASE_URL="$DATABASE_URL" SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@shore360.local}" SEED_ADMIN_NAME="${SEED_ADMIN_NAME:-Initial Administrator}" shore-sentinel bootstrap-admin

trap - EXIT INT TERM
cleanup_bootstrap
exec supervisord -n -c /etc/supervisord.conf
