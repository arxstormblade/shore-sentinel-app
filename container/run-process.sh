#!/bin/sh
set -eu

process=${1:?process name required}
shift

wait_for_url() {
  url=$1
  i=0
  while [ "$i" -lt 60 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  echo "dependency did not become ready: $url" >&2
  return 1
}

wait_for_postgres() {
  i=0
  while [ "$i" -lt 60 ]; do
    if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  echo "dependency did not become ready: postgres" >&2
  return 1
}

wait_for_redis() {
  i=0
  while [ "$i" -lt 60 ]; do
    if redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -qx PONG; then return 0; fi
    i=$((i + 1))
    sleep 1
  done
  echo "dependency did not become ready: redis" >&2
  return 1
}

case "$process" in
  postgres)
    exec su-exec shore-postgres env -i PATH="$PATH" PGDATA="${PGDATA:?}" postgres -D "$PGDATA" -c listen_addresses=127.0.0.1 -c port=5432
    ;;
  redis)
    exec su-exec shore-redis env -i PATH="$PATH" redis-server "$REDIS_CONFIG"
    ;;
  minio)
    exec su-exec shore-minio env -i PATH="$PATH" MINIO_ROOT_USER="${MINIO_ACCESS_KEY:?}" MINIO_ROOT_PASSWORD="${MINIO_SECRET_KEY:?}" minio server "$MINIO_DATA_DIR" --address 127.0.0.1:9000
    ;;
  api)
    wait_for_postgres
    wait_for_redis
    wait_for_url http://127.0.0.1:9000/minio/health/live
    exec su-exec shore-api env -i PATH="$PATH" NODE_ENV="$NODE_ENV" PORT="$PORT" DATABASE_URL="$DATABASE_URL" POSTGRES_PASSWORD="$POSTGRES_PASSWORD" SEED_ADMIN_PASSWORD="$SEED_ADMIN_PASSWORD" REDIS_URL="$REDIS_URL" MINIO_ENDPOINT="$MINIO_ENDPOINT" MINIO_BUCKET="$MINIO_BUCKET" MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" MINIO_SECRET_KEY="$MINIO_SECRET_KEY" SHORE_SENTINEL_SECRET_KEY="$SHORE_SENTINEL_SECRET_KEY" INTERNAL_WORKER_TOKEN="$INTERNAL_WORKER_TOKEN" node /opt/shore-sentinel/api/dist/main.js
    ;;
  worker-node)
    wait_for_redis
    wait_for_url http://127.0.0.1:4000/health
    wait_for_url http://127.0.0.1:4100/health
    exec su-exec shore-worker env -i PATH="$PATH" NODE_ENV="$NODE_ENV" REDIS_URL="$REDIS_URL" API_URL="$API_URL" PYTHON_WORKER_URL="$PYTHON_WORKER_URL" INTERNAL_WORKER_TOKEN="$INTERNAL_WORKER_TOKEN" WORKER_CONCURRENCY="$WORKER_CONCURRENCY" WORKER_MAX_ATTEMPTS="$WORKER_MAX_ATTEMPTS" WORKER_BACKOFF_MS="$WORKER_BACKOFF_MS" node /opt/shore-sentinel/workers/worker-node/src/index.js
    ;;
  worker-python)
    exec su-exec shore-parser env -i PATH="$PATH" PYTHONPATH=/opt/shore-sentinel/workers/worker-python/src PYTHON_WORKER_PORT="$PYTHON_WORKER_PORT" INTERNAL_WORKER_TOKEN="$INTERNAL_WORKER_TOKEN" python3 /opt/shore-sentinel/workers/worker-python/src/server.py
    ;;
  web)
    wait_for_url http://127.0.0.1:4000/health
    exec su-exec shore-web env -i PATH="$PATH" NODE_ENV="$NODE_ENV" PORT="$WEB_PORT" HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 node /opt/shore-sentinel/web/web/server.js
    ;;
  *)
    echo "unknown supervised process" >&2
    exit 64
    ;;
esac
