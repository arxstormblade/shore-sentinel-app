import Link from 'next/link';
import { routePath } from '@/lib/paths';

const fleet = [
  { label: 'Online', value: 42, color: 'green', sub: 'Machines' },
  { label: 'Offline', value: 7, color: 'amber', sub: 'Machines' },
  { label: 'Stale', value: 11, color: 'gray', sub: 'Machines' },
];

const severity = [
  { label: 'Critical', value: 18, pct: '21%', color: 'red' },
  { label: 'High', value: 34, pct: '39%', color: 'orange' },
  { label: 'Medium', value: 22, pct: '25%', color: 'yellow' },
  { label: 'Low', value: 13, pct: '15%', color: 'green' },
];

const scans = [
  ['WEB-SRV-01', 'Security Audit', 'Completed', '12 (3 Critical)', 'May 15, 2025 10:24 AM', '▣'],
  ['LAPTOP-23', 'Compliance Audit', 'Completed', '7 (1 Critical)', 'May 15, 2025 9:15 AM', '▣'],
  ['DB-SRV-02', 'Security Audit', 'Completed', '5 (0 Critical)', 'May 14, 2025 5:42 PM', '▣'],
  ['FILE-SRV-01', 'Quick Scan', 'Completed', '2 (0 Critical)', 'May 14, 2025 2:11 PM', '▣'],
  ['DEV-WS-17', 'Security Audit', 'Failed', '—', 'May 14, 2025 11:03 AM', '—'],
];

const guides = [
  ['▤', 'Connect a new endpoint', 'Step-by-step guide to add and onboard a new machine.'],
  ['⌕', 'Run an audit scan', 'How to run on-demand scans and understand results.'],
  ['♢', 'Review remediation steps', 'Identify issues and apply recommended fixes.'],
  ['▥', 'Export compliance report', 'Generate and export reports for audits and compliance.'],
];

export default function Dashboard() {
  return (
    <div className="dashboard-shell" data-view="Managed-machine dashboard">
      <section className="panel dashboard-hero">
        <div className="hero-copy">
          <p className="eye">Single-tenant security operations</p>
          <h1>Keep managed machines, one-time audits, and remediation in one calm control plane.</h1>
          <p>
            Shore Sentinel keeps the first decision obvious: launch an ad hoc audit or enroll a managed
            machine, then move straight into evidence, trends, and follow-up.
          </p>
          <div className="hero-chipbar">
            <span className="chip green">Tailnet secure</span>
            <span className="chip">Single tenant</span>
            <span className="chip">Dark operator UI</span>
          </div>
        </div>

        <div className="signal-board">
          <div className="signal-card accent">
            <span>Managed fleet</span>
            <strong>42 online</strong>
            <small>7 offline · 11 stale</small>
          </div>
          <div className="signal-card">
            <span>Findings</span>
            <strong>87</strong>
            <small>18 critical · 34 high</small>
          </div>
          <div className="signal-card wide">
            <span>Primary actions</span>
            <strong>Run audit · Add machine</strong>
            <small>Everything else stays in secondary workflows.</small>
          </div>
        </div>
      </section>

      <section className="hero-actions">
        <article className="action-card panel">
          <div className="round-icon">▣</div>
          <div>
            <h2>Run One-Time Audit</h2>
            <p>
              Run an on-demand audit scan against one or more machines to assess security configuration and
              identify issues.
            </p>
            <Link className="btn" href={routePath('/audits/new')}>Run Audit</Link>
          </div>
        </article>

        <article className="action-card panel">
          <div className="round-icon">⊞</div>
          <div>
            <h2>Add Managed Machine</h2>
            <p>
              Add a new machine to your inventory and begin continuous monitoring, reporting, and history.
            </p>
            <Link className="btn" href={routePath('/inventory/new')}>Add Machine</Link>
          </div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel data-panel fleet-panel">
          <header>
            <h2>Managed Machine Fleet</h2>
            <span className="info-dot">i</span>
          </header>
          <div className="fleet-cards">
            {fleet.map((item) => (
              <div className="fleet-card" key={item.label}>
                <span className={`status-dot ${item.color}`} />
                <b>{item.label}</b>
                <strong>{item.value}</strong>
                <small>{item.sub}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel data-panel severity-panel">
          <h2>Findings by Severity</h2>
          <div className="severity-content">
            <div className="donut" aria-label="Findings by Severity chart" />
            <div className="severity-list">
              {severity.map((item) => (
                <div key={item.label}>
                  <span className={`status-dot ${item.color}`} />
                  <span>{item.label}</span>
                  <b>{item.value}</b>
                  <small>{item.pct}</small>
                </div>
              ))}
            </div>
            <div className="total-findings">
              <span>Total Findings</span>
              <strong>87</strong>
              <small>Across all machines</small>
            </div>
          </div>
        </article>

        <article className="panel data-panel scans-panel">
          <header>
            <h2>Recent Scans</h2>
            <Link href={routePath('/scans-reports')}>View all scans</Link>
          </header>
          <table>
            <thead>
              <tr>
                <th>Machine</th>
                <th>Scan Type</th>
                <th>Status</th>
                <th>Findings</th>
                <th>Last Run</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((row) => (
                <tr key={row[0]}>
                  <td data-label="Machine">{row[0]}</td>
                  <td data-label="Scan Type">{row[1]}</td>
                  <td data-label="Status"><span className={row[2] === 'Failed' ? 'failed' : 'completed'}>{row[2]}</span></td>
                  <td data-label="Findings">{row[3]}</td>
                  <td data-label="Last Run">{row[4]}</td>
                  <td data-label="Report">{row[5]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager"><span>‹</span><b>1</b><span>2</span><span>3</span><span>›</span></div>
        </article>

        <article className="panel data-panel kb-panel">
          <header>
            <h2>Knowledgebase</h2>
            <Link href={routePath('/knowledgebase')}>View all articles</Link>
          </header>
          <div className="guide-list">
            {guides.map(([icon, title, desc]) => (
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
