import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { filterRuns } from '@/lib/filters';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

async function loadRuns() {
  try {
    const response = await fetch(`${serverApiBase()}/scan-runs`, { cache: 'no-store' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

function formatTime(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString(); } catch { return '—'; }
}

function artifactLabel(type) {
  const labels = { pdf: 'PDF', markdown: 'Markdown', sarif: 'SARIF', json: 'JSON', 'scanner.normalized_findings': 'Findings JSON', 'scanner.raw_output': 'Raw scanner output' };
  return labels[type] || type;
}

export default async function Scans({ searchParams }) {
  const runStatus = searchParams?.runStatus;
  const severity = searchParams?.severity;
  const env = searchParams?.env;
  const timeRange = searchParams?.timeRange;
  const runs = await loadRuns();
  const filteredRuns = filterRuns(runs, { runStatus, severity, env, timeRange });
  const completed = filteredRuns.filter((run) => run.status === 'completed');
  const running = filteredRuns.filter((run) => ['running', 'leased', 'pending'].includes(String(run.status)));

  const resultCounts = {
    total: runs.length,
    after: filteredRuns.length,
    status: runStatus || 'all severities & statuses',
  };
  const clearHref = routePath('/scans-reports');
  return (
    <div className="stack">
      <Header eye="Scans & Reports" title="Run scans, follow progress, review reports" desc="Completed scans, live progress, and generated artifacts are shown together so you know where to act next.">
        <Link id="audit-entry" className="btn" href={routePath('/scans/start')}>Start scan</Link>
      </Header>
      <div aria-live="polite" className="result-summary" data-testid="scans-result-summary">
        Showing {resultCounts.after} of {resultCounts.total} scans ({resultCounts.status})
        {resultCounts.after !== resultCounts.total ? <a className="btn-link" href={clearHref}>Clear filters</a> : null}
      </div>

      <Filters name="Scans & Reports" items={['Severity', 'Status', 'Time range', 'Environment']} />


      <section className="panel scans-panel">
        <header><div><h2>Recent scan runs</h2><p>Scan completed rows link directly to reports and artifacts. Running rows show progress entry points.</p></div><Pill>{filteredRuns.length} scans</Pill></header>
        {filteredRuns.length ? (
          <table><thead className="visually-hidden"><tr><th>Subject</th><th>Status</th><th>Findings</th><th>Completed</th><th>Next action</th></tr></thead><tbody>
            {filteredRuns.map((run) => (
              <tr key={run.id}>
                <td data-label="Subject">{run.subject_name || run.id}</td>
                <td data-label="Status"><span className={run.status === 'completed' ? 'completed' : 'failed'}>{run.status}</span></td>
                <td data-label="Findings">{run.findings_count ?? 0}</td>
                <td data-label="Completed">{formatTime(run.completed_at || run.created_at)}</td>
                <td data-label="Next action"><Link href={routePath(`/scans-reports/reports/${run.id}`)}>{run.status === 'completed' ? 'Open report' : 'View progress'}</Link></td>
              </tr>
            ))}
          </tbody></table>
        ) : <div className="empty" data-testid="scans-empty-state"><h3>No scans match the current filters</h3><p>Try adjusting your filters to see more results, or clear them to view all scans.</p><Link className="btn" href={clearHref}>Clear filters</Link></div>}
      </section>

      <section className="panel">
        <header><div><h2>Generated artifacts</h2><p>Downloadable evidence from completed scans.</p></div><Pill>{completed.length} completed</Pill></header>
        {completed.some((run) => Array.isArray(run.artifacts) && run.artifacts.length) ? (
          <div className="cards report-cards">
            {completed.flatMap((run) => (run.artifacts || []).map((artifact) => (
              <article className="card report-card" key={`${run.id}-${artifact.id}`}>
                <h3>{artifactLabel(artifact.artifact_type)}</h3>
                <p>Scan completed for {run.subject_name || run.id}.</p>
                <p>{artifact.size_bytes ? `${artifact.size_bytes} bytes` : 'Generated artifact'}</p>
                <a className="btn" href={`${apiBase}/artifacts/${artifact.id}/download`} target="_blank" rel="noreferrer">Open artifact</a>
              </article>
            )))}
          </div>
        ) : <div className="empty" data-testid="artifacts-empty-state"><h3>No generated artifacts yet</h3><p>Completed scan reports will appear here when scans finish. Each artifact includes PDF, SARIF, or JSON evidence for compliance and review.</p><Link className="btn" href={routePath('/scans/start')}>Start scan</Link></div>}
      </section>

      {running.length ? <section className="panel"><h2>Active progress</h2><p>{running.length} scan is still running or queued. Use View progress from the table above before starting another scan on the same subject.</p></section> : null}
    </div>
  );
}
