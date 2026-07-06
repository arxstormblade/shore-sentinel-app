'use client';

import { useState } from 'react';
import { applyUpdate, checkUpdate } from '@/lib/update-api';

function OutputBlock({ result }) {
  if (!result) return null;
  return (
    <section className="panel update-output" aria-live="polite">
      <header>
        <h2>Update output</h2>
        <span className={`pill ${result.ok ? 'green' : 'amber'}`}>{result.mode || 'status'}</span>
      </header>
      <dl className="update-meta">
        <div><dt>Enabled</dt><dd>{result.enabled ? 'Yes' : 'No'}</dd></div>
        <div><dt>Exit code</dt><dd>{result.exitCode ?? 'n/a'}</dd></div>
        <div><dt>Script</dt><dd>{result.script || 'not configured'}</dd></div>
      </dl>
      <pre>{[result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'No output returned.'}</pre>
    </section>
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
    <div className="stack update-page">
      <section className="hero">
        <div>
          <p className="eye">System update</p>
          <h1>Update Shore Sentinel from GitHub</h1>
          <p>Check for new commits and apply fast-forward Docker Compose updates from the configured remote repository.</p>
        </div>
        <div className="actions">
          <button className="btn alt" disabled={Boolean(busy)} onClick={() => run('check')}>{busy === 'check' ? 'Checking…' : 'Check for updates'}</button>
          <button className="btn" disabled={Boolean(busy) || !result?.enabled} onClick={() => run('apply')}>{busy === 'apply' ? 'Updating…' : 'Apply update'}</button>
        </div>
      </section>

      <section className="panel update-warning">
        <header>
          <h2>Operational safety</h2>
          <span className={`pill ${result?.enabled ? 'green' : 'amber'}`}>{result?.enabled ? 'Enabled' : 'Disabled by default'}</span>
        </header>
        <p>
          Self-update is intentionally disabled unless the host mounts the Git checkout, update script, and Docker socket into the API container. Applying an update can rebuild and restart services, so only administrators should use this control.
        </p>
      </section>

      {error ? <div className="error-banner"><span>{error}</span><button className="btn ghost" onClick={() => setError('')}>Dismiss</button></div> : null}
      <OutputBlock result={result} />
    </div>
  );
}
