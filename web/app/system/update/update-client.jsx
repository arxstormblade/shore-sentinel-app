'use client';

import { useState } from 'react';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsDisclosure, OperationsSummaryStrip, Pill } from '@/components/ui';
import { applyUpdate, checkUpdate } from '@/lib/update-api';

function OutputBlock({ result }) {
  if (!result) return null;
  return (
    <OperationalSection eyebrow="Execution result" title="Update output" status={<Pill tone={result.ok ? 'green' : 'amber'}>{result.mode || 'status'}</Pill>}>
      <OperationsSummaryStrip label="Update result metadata" items={[{ label: 'Enabled', value: result.enabled ? 'Yes' : 'No' }, { label: 'Exit code', value: result.exitCode ?? 'n/a' }, { label: 'Script', value: result.script || 'Not configured' }]} />
      <OperationsDisclosure summary="View execution output" defaultOpen><div className="update-output"><pre>{[result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'No output returned.'}</pre></div></OperationsDisclosure>
    </OperationalSection>
  );
}

export default function UpdateClient({ initialStatus }) {
  const [result, setResult] = useState(initialStatus);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(action) {
    setBusy(action);
    setError('');
    try {
      const next = action === 'check' ? await checkUpdate() : await applyUpdate();
      setResult(next);
    } catch (err) {
      setError(err.message || 'Update request failed');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="operations-page update-page">
      <CompactPageHeader eyebrow="System maintenance" title="Update Shore Sentinel" description="Check release readiness and apply an approved fast-forward Docker Compose update from the configured repository." status={<Pill tone={result?.enabled ? 'green' : 'amber'}>{result?.enabled ? 'Enabled' : 'Disabled by default'}</Pill>} actions={<><button className="btn alt" disabled={Boolean(busy)} onClick={() => run('check')}>{busy === 'check' ? 'Checking…' : 'Check for updates'}</button><button className="btn" disabled={Boolean(busy) || !result?.enabled} onClick={() => run('apply')}>{busy === 'apply' ? 'Updating…' : 'Apply update'}</button></>} />
      <OperationsSummaryStrip items={[{ label: 'Update control', value: result?.enabled ? 'Enabled' : 'Disabled' }, { label: 'Last action', value: result?.mode || 'Status' }, { label: 'Exit code', value: result?.exitCode ?? 'n/a' }]} />
      <OperationalSection eyebrow="Safety gate" title="Operational safety" status={<Pill tone={result?.enabled ? 'green' : 'amber'}>{result?.enabled ? 'Enabled' : 'Disabled'}</Pill>}>
        <p>
          Self-update is intentionally disabled unless the host mounts the Git checkout, update script, and Docker socket into the API container. Applying an update can rebuild and restart services, so only administrators should use this control.
        </p>
      </OperationalSection>

      {error ? <ComposedEmptyState tone="error" title="Update request failed" description={error} actions={<button className="btn ghost" onClick={() => setError('')}>Dismiss</button>} /> : null}
      {result ? <OutputBlock result={result} /> : <ComposedEmptyState title="No update output yet" description="Check for updates to retrieve the current release readiness and command output." />}
    </div>
  );
}
