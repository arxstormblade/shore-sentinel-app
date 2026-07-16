import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function groupByMachine(items) {
  const groups = new Map();
  for (const item of items) {
    const machine = item.asset || 'Unassigned machine';
    const existing = groups.get(machine) || {
      machine,
      env: item.env || 'Unknown environment',
      owner: item.owner || 'Unassigned owner',
      findings: [],
      severityCounts: {},
      openCount: 0,
    };
    existing.findings.push(item);
    const severity = item.severity || 'informational';
    existing.severityCounts[severity] = (existing.severityCounts[severity] || 0) + 1;
    if (String(item.status).toLowerCase() === 'open') existing.openCount += 1;
    groups.set(machine, existing);
  }
  return Array.from(groups.values()).sort((a, b) => a.machine.localeCompare(b.machine));
}

export default async function Remediation() {
  noStore();
  const remediations = await apiGet('/remediation');
  const machineGroups = groupByMachine(remediations);

  return (
    <div className="stack">
      <Header eye="Remediation" title="Machine remediation queue" desc="Choose a machine first. Review its summary findings, then expand it to see remediation options and evidence." />
      <Filters name="Remediation" items={['Machine', 'Severity', 'Status', 'Environment']} />
      <p className="note">API list: {apiBase}/remediation</p>
      {machineGroups.length === 0 ? (
        <Empty />
      ) : (
        <section className="panel machine-remediation-panel">
          <header>
            <div>
              <h2>Machines with findings</h2>
              <p>Summary findings stay visible. Remediation guidance and evidence links appear after you open a machine.</p>
            </div>
          </header>
          <div className="machine-remediation-list">
            {machineGroups.map((group) => (
              <details className="machine-remediation-card" key={group.machine}>
                <summary className="machine-remediation-summary">
                  <span className="machine-summary-main">
                    <b>{group.machine}</b>
                    <small>{group.env} · {group.owner}</small>
                  </span>
                  <span className="machine-summary-findings">
                    {group.findings.slice(0, 3).map((finding) => (
                      <span className="machine-summary-finding" key={finding.id}>{finding.title || finding.finding_title}</span>
                    ))}
                  </span>
                  <span className="machine-summary-meta">
                    <Pill>{group.findings.length} finding{group.findings.length === 1 ? '' : 's'}</Pill>
                    {Object.entries(group.severityCounts).map(([severity, count]) => <Pill key={severity}>{count} {severity}</Pill>)}
                    <span className="machine-open-hint">Open machine</span>
                  </span>
                </summary>
                <div className="machine-remediation-body">
                  <div className="machine-remediation-body-head">
                    <span>
                      <b>Remediation options and evidence</b>
                      <small>{group.openCount} open item{group.openCount === 1 ? '' : 's'} for this machine</small>
                    </span>
                  </div>
                  <div className="machine-finding-stack">
                    {group.findings.map((item) => (
                      <article className="machine-finding-row" key={item.id}>
                        <span>
                          <small className="finding-row-kicker">{item.severity} · {item.status}</small>
                          <b>{item.title || item.finding_title}</b>
                          <small>{item.guidance || item.action || item.evidence_summary || 'Review scanner evidence and apply the recommended remediation.'}</small>
                        </span>
                        <span className="chip-row">
                          <Pill>{item.severity || 'informational'}</Pill>
                          <Pill>{item.status}</Pill>
                          <Link className="btn alt" href={routePath('/remediation/' + item.id)}>View evidence</Link>
                        </span>
                      </article>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
