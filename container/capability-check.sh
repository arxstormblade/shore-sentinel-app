#!/bin/sh
set -eu

# CAP_CHOWN=0, CAP_SETGID=6, CAP_SETUID=7. Parse the kernel's effective
# capability field instead of relying on a textual process/config check.
python3 - <<'PY'
effective = None
with open('/proc/1/status', encoding='ascii') as status:
    for line in status:
        if line.startswith('CapEff:'):
            effective = line.split()[1]
            break

if effective is None:
    raise SystemExit('CapEff is missing from /proc/1/status')

try:
    mask = int(effective, 16)
except ValueError as error:
    raise SystemExit(f'invalid CapEff value: {effective!r}') from error

allowed = (1 << 0) | (1 << 6) | (1 << 7)
if mask != allowed:
    unexpected = mask & ~allowed
    raise SystemExit(f'unexpected effective capabilities: 0x{unexpected:x}')

print('effective capabilities: CAP_CHOWN,CAP_SETGID,CAP_SETUID')
PY
