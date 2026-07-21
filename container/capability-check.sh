#!/bin/sh
set -eu

# CAP_CHOWN=0, CAP_SETGID=6, CAP_SETUID=7 => 0x00000000000000c1.
effective=$(awk '/^CapEff:/ { print tolower($2) }' /proc/1/status)
case "$effective" in
  00000000000000c1|c1) exit 0 ;;
  *) echo "unexpected effective capability mask: $effective" >&2; exit 1 ;;
esac