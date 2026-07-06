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

scanner_files = sorted(p.relative_to(root / 'scanner-bundle').as_posix() for p in (root / 'scanner-bundle').rglob('*') if p.is_file())
allowed_scanner_roots = {'README.md', 'schemas/scanner-output.schema.json', 'schemas/scanner-manifest.schema.json', 'examples/sample-output.json'}
unexpected_scanner_files = [p for p in scanner_files if p not in allowed_scanner_roots]

for rel in ['package.json', 'web/package.json', 'api/package.json', 'workers/worker-node/package.json', 'packages/shared/package.json']:
    with (root / rel).open() as handle:
        json.load(handle)

failures = []
if missing:
    failures.append('missing required Phase 0 paths: ' + ', '.join(missing))
if unexpected_scanner_files:
    failures.append('unexpected scanner-bundle files: ' + ', '.join(unexpected_scanner_files))
if not (root / 'web/app/globals.css').exists() and (root / 'web/app/layout.jsx').exists():
    failures.append('web/app/layout.jsx exists but web/app/globals.css is missing')
if failures:
    for failure in failures:
        print(f'Phase 0 validation failed: {failure}')
    raise SystemExit(1)
print('Phase 0 scaffold validation passed')
