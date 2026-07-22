#!/bin/sh
set -eu

/opt/shore-sentinel/bin/capability-check.sh

status=$(supervisorctl status)
printf '%s\n' "$status" | awk '
  BEGIN {
    expected["shore-sentinel:postgres"] = 1
    expected["shore-sentinel:redis"] = 1
    expected["shore-sentinel:minio"] = 1
    expected["shore-sentinel:api"] = 1
    expected["shore-sentinel:worker-node"] = 1
    expected["shore-sentinel:worker-python"] = 1
    expected["shore-sentinel:web"] = 1
    required = 7
  }
  {
    if (NF < 4 || !($1 in expected) || $2 != "RUNNING" || $3 != "pid" || $4 !~ /^[0-9]+,/) {
      invalid = 1
      next
    }
    if (seen[$1]++) {
      invalid = 1
      next
    }
    running++
  }
  END {
    if (invalid || running != required) exit 1
  }
'

check_single_process() {
  name=$1
  pattern=$2
  count=$(ps -o args | awk -v pattern="$pattern" '$0 ~ pattern { count++ } END { print count + 0 }')
  [ "$count" = 1 ] || {
    echo "expected exactly one $name process, found $count" >&2
    return 1
  }
}

check_single_process postgres '^postgres -D '
check_single_process redis '^redis-server '
check_single_process minio '^minio server '

pg_isready -h 127.0.0.1 -p 5432 >/dev/null
redis-cli -h 127.0.0.1 ping | grep -qx PONG
curl -fsS http://127.0.0.1:9000/minio/health/live >/dev/null
curl -fsS http://127.0.0.1:4000/health >/dev/null
curl -fsS http://127.0.0.1:4100/health >/dev/null
curl -fsS http://127.0.0.1:3010/shore-sentinel/dashboard >/dev/null
