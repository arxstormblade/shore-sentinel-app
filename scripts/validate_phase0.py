#!/usr/bin/env python3
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
required = [
    'docker-compose.yml',
    '.env.example',
    'api',
    'web',
    'workers/worker-node',
    'workers/worker-python',
    'packages/shared',
    'scanner-bundle',
    'infra/postgres',
    'infra/redis',
    'infra/minio',
    'CHANGELOG.md',
]
missing = [rel for rel in required if not (root / rel).exists()]

scanner_files = sorted(
    p.relative_to(root / 'scanner-bundle').as_posix()
    for p in (root / 'scanner-bundle').rglob('*')
    if p.is_file() and '__pycache__' not in p.parts and p.suffix != '.pyc'
)
allowed_scanner_files = {
    'README.md',
    'bin/Agent_Security_Selfcheck_v3.4.0.py',
    'bin/envdetect.py',
    'bin/hardware_collection.py',
    'docs/AGENT_SECURITY_SELFCHECK_VERSION_HISTORY.md',
    'docs/agent-security-selfcheck.md',
    'examples/sample-output.json',
    'schemas/scanner-manifest.schema.json',
    'schemas/scanner-output.schema.json',
    'tools/ARX_Agent_Security_Remediation.py',
}
unexpected_scanner_files = [p for p in scanner_files if p not in allowed_scanner_files]
missing_scanner_files = sorted(allowed_scanner_files - set(scanner_files))

for rel in ['package.json', 'web/package.json', 'api/package.json', 'workers/worker-node/package.json', 'packages/shared/package.json']:
    with (root / rel).open() as handle:
        json.load(handle)

failures = []
if missing:
    failures.append('missing required Phase 0 paths: ' + ', '.join(missing))
if missing_scanner_files:
    failures.append('missing scanner-bundle files: ' + ', '.join(missing_scanner_files))
if unexpected_scanner_files:
    failures.append('unexpected scanner-bundle files: ' + ', '.join(unexpected_scanner_files))
if not (root / 'web/app/globals.css').exists() and (root / 'web/app/layout.jsx').exists():
    failures.append('web/app/layout.jsx exists but web/app/globals.css is missing')
if failures:
    for failure in failures:
        print(f'Phase 0 validation failed: {failure}')
    raise SystemExit(1)
print('Phase 0 scaffold validation passed')
