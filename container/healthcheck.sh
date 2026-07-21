#!/bin/sh
set -eu

/opt/shore-sentinel/bin/capability-check.sh

check_process() {
  name=$1
  status=$(supervisorctl status "shore-sentinel:$name")
  printf '%s\n' "$status" | grep -Eq "^shore-sentinel:${name}[[:space:]]+RUNNING[[:space:]]"
}

for process in postgres redis minio api worker-node worker-python web; do
  check_process "$process"
done

pg_isready -h 127.0.0.1 -p 5432 >/dev/null
redis-cli -h 127.0.0.1 ping | grep -qx PONG
curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null
curl -fsS http://127.0.0.1:4000/health >/dev/null
curl -fsS http://127.0.0.1:4100/health >/dev/null
curl -fsS http://127.0.0.1:3010/shore-sentinel/dashboard >/dev/null
