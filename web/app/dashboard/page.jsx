import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const severityOrder = ['critical', 'high', 'medium', 'low'];
const severityTone = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'green',
};

function pct(part, total) {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status) {
  return String(status || 'queued').replace(/_/g, ' ');
}

export default async function Dashboard() {
  noStore();
  const [targets, reports, remediations] = await Promise.all([
    apiGet('/targets'),
    apiGet('/reports'),
    apiGet('/remediation'),
  ]);

  const managedCount = targets.length;
  const reportCount = reports.length;
  const remediationCount = remediations.length;
  const latestReports = reports.slice(0, 5);
  const severityCounts = severityOrder.map((severity) => ({
    label: severity[0].toUpperCase() + severity.slice(1),
    key: severity,
    value: remediations.filter((item) => String(item.severity || '').toLowerCase() === severity).length,
    tone: severityTone[severity],
  }));
  const totalFindings = severityCounts.reduce((sum, item) => sum + item.value, 0);
  const openRemediations = remediations.filter((item) => !['resolved', 'closed', 'accepted'].includes(String(item.status || '').toLowerCase())).length;
  const latestReport = latestReports[0];

  return (
    <div className="dashboard-shell" data-view="Managed-machine dashboard">
      <section className="panel dashboard-hero">
        <div className="hero-copy">
          <p className="eye">Single-tenant security operations</p>
          <h1>Calm control for machines, scans, evidence, and remediation.</h1>
          <p>
            Shore Sentinel keeps the operator path direct: enroll assets, run scanner bundles, review generated
            artifacts, and close remediation work from the same focused surface.
          </p>
          <div className="hero-chipbar">
            <span className="chip green">Tailnet secure</span>
            <span className="chip">Live scanner data</span>
            <span className="chip">Machine-first triage</span>
          </div>
        </div>

        <div className="signal-board" aria-label="Operational summary">
          <div className="signal-card accent">
            <span>Managed assets</span>
            <strong>{managedCount}</strong>
            <small>{managedCount === 1 ? 'machine enrolled' : 'machines enrolled'}</small>
          </div>
          <div className="signal-card">
            <span>Scanner reports</span>
            <strong>{reportCount}</strong>
            <small>{latestReport ? `Latest ${formatDate(latestReport.completed_at || latestReport.started_at)}` : 'No generated reports yet'}</small>
          </div>
          <div className="signal-card wide">
            <span>Open remediation</span>
            <strong>{openRemediations}</strong>
            <small>{remediationCount} total remediation records tracked from scanner output.</small>
          </div>
        </div>
      </section>

      <section className="hero-actions" aria-label="Primary operator actions">
        <article className="action-card panel">
          <div className="round-icon">ADD</div>
          <div>
            <h2>Add managed machine</h2>
            <p>Enroll an asset for ongoing inventory, report history, and machine-first remediation.</p>
            <Link className="btn" href={routePath('/inventory/new')}>Add machine</Link>
          </div>
        </article>

        <article className="action-card panel">
          <div className="round-icon">REP</div>
          <div>
            <h2>Review scanner reports</h2>
            <p>Open generated evidence, findings, and remediation context from managed-machine scans.</p>
            <Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel data-panel fleet-panel">
          <header>
            <h2>Managed machine fleet</h2>
            <Link href={routePath('/inventory')}>View inventory</Link>
          </header>
          <div className="fleet-cards">
            {targets.slice(0, 3).map((target) => (
              <Link className="fleet-card" href={routePath(`/inventory/machines/${target.id}`)} key={target.id}>
                <span className="status-dot green" />
                <b>{target.name || target.hostname || 'Managed machine'}</b>
                <strong>{target.status || 'Active'}</strong>
                <small>{target.os || target.platform || target.env || 'Endpoint'}</small>
              </Link>
            ))}
            {targets.length === 0 ? (
              <div className="fleet-card muted-card">
                <span className="status-dot gray" />
                <b>No managed machines</b>
                <strong>0</strong>
                <small>Add a machine to populate fleet status.</small>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel data-panel severity-panel">
          <h2>Findings by severity</h2>
          <div className="severity-content">
            <div className="donut" aria-label="Findings by severity chart" />
            <div className="severity-list">
              {severityCounts.map((item) => (
                <div key={item.key}>
                  <span className={`status-dot ${item.tone}`} />
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                  <small>{pct(item.value, totalFindings)}</small>
                </div>
              ))}
            </div>
            <div className="total-findings">
              <span>Total findings</span>
              <strong>{totalFindings}</strong>
              <small>Across generated remediation records</small>
            </div>
          </div>
        </article>

        <article className="panel data-panel scans-panel">
          <header>
            <h2>Recent scanner reports</h2>
            <Link href={routePath('/scans-reports')}>View all reports</Link>
          </header>
          {latestReports.length === 0 ? (
            <div className="empty-state">Add a managed machine and run a managed scan to generate PDF, Markdown, SARIF, and JSON artifacts.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Status</th>
                  <th>Findings</th>
                  <th>Last run</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {latestReports.map((report) => (
                  <tr key={report.id}>
                    <td data-label="Report">{report.title || report.source || 'Scanner report'}</td>
                    <td data-label="Status"><span className={String(report.status).toLowerCase() === 'failed' ? 'failed' : 'completed'}>{statusLabel(report.status)}</span></td>
                    <td data-label="Findings">{report.finding_count || 0}</td>
                    <td data-label="Last run">{formatDate(report.completed_at || report.started_at)}</td>
                    <td data-label="Open"><Link href={routePath(`/scans-reports/reports/${report.id}`)}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="panel data-panel kb-panel">
          <header>
            <h2>Operator workflow</h2>
            <Link href={routePath('/knowledgebase')}>Open guide</Link>
          </header>
          <div className="guide-list">
            {[
              ['01', 'Enroll assets', 'Create a managed machine record before recurring review.'],
              ['02', 'Generate evidence', 'Run managed scans and keep report artifacts attached.'],
              ['03', 'Triage by machine', 'Work remediation per asset so ownership stays clear.'],
              ['04', 'Export and close', 'Use PDF, Markdown, SARIF, and JSON for audit packages.'],
            ].map(([icon, title, desc]) => (
              <Link href={routePath('/knowledgebase')} key={title}>
                <span>{icon}</span>
                <div>
                  <b>{title}</b>
                  <small>{desc}</small>
                </div>
                <i>›</i>
              </Link>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
