#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bundle = root / 'scanner-bundle'
scanner = bundle / 'bin' / 'Agent_Security_Selfcheck_v3.4.0.py'
required = [
    scanner,
    bundle / 'bin' / 'envdetect.py',
    bundle / 'bin' / 'hardware_collection.py',
    bundle / 'tools' / 'ARX_Agent_Security_Remediation.py',
    bundle / 'schemas' / 'scanner-manifest.schema.json',
    bundle / 'schemas' / 'scanner-output.schema.json',
    bundle / 'examples' / 'sample-output.json',
    bundle / 'docs' / 'agent-security-selfcheck.md',
    bundle / 'docs' / 'AGENT_SECURITY_SELFCHECK_VERSION_HISTORY.md',
]
missing = [str(p.relative_to(root)) for p in required if not p.exists()]
if missing:
    print('Scanner bundle validation failed: missing ' + ', '.join(missing))
    raise SystemExit(1)

for rel in ['schemas/scanner-manifest.schema.json', 'schemas/scanner-output.schema.json', 'examples/sample-output.json']:
    with (bundle / rel).open() as handle:
        json.load(handle)

help_run = subprocess.run(['python3', str(scanner), '--help'], cwd=bundle, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
if help_run.returncode != 0 or '--target' not in help_run.stdout or '--out-dir' not in help_run.stdout:
    print('Scanner bundle validation failed: scanner help output is invalid')
    print(help_run.stdout)
    print(help_run.stderr)
    raise SystemExit(1)

with tempfile.TemporaryDirectory(prefix='shore-scanner-validate-') as tmp:
    out_dir = Path(tmp) / 'reports'
    run = subprocess.run([
        'python3', str(scanner),
        '--target', str(root),
        '--out-dir', str(out_dir),
        '--exit-zero',
    ], cwd=bundle, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    if run.returncode != 0:
        print('Scanner bundle validation failed: scanner execution failed')
        print(run.stdout)
        print(run.stderr)
        raise SystemExit(1)
    raw_report = next((p for p in out_dir.glob('*.json')), None)
    if raw_report is None:
        print('Scanner bundle validation failed: missing JSON report')
        raise SystemExit(1)
    with raw_report.open() as handle:
        raw = json.load(handle)
    self_hits = [
        finding for finding in raw.get('findings', [])
        if finding.get('check') == 'No obvious plaintext secrets in non-secret configs'
        and 'Agent_Security_Selfcheck_v3.4.0.py' in str(finding.get('evidence', ''))
    ]
    if self_hits:
        print('Scanner bundle validation failed: self-scan secret false positive still present')
        raise SystemExit(1)
    reports = sorted(out_dir.glob('*'))
    suffixes = {p.suffix for p in reports}
    expected = {'.json', '.md', '.sarif', '.pdf'}
    if not expected.issubset(suffixes):
        print('Scanner bundle validation failed: missing report formats; saw ' + ', '.join(sorted(suffixes)))
        raise SystemExit(1)

print('Scanner bundle validation passed')
