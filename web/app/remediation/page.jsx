import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

<<<<<<< HEAD
export const dynamic = 'force-dynamic';
export const revalidate = 0;
=======
const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');
const severityTone = { critical: 'red', high: 'red', medium: 'amber', low: 'yellow', informational: 'blue' };
const severityOrder = ['critical', 'high', 'medium', 'low', 'informational'];
const severityExplanations = {
  critical: 'Active exploitation or confirmed compromise. Stop other work and triage now.',
  high: 'High-confidence finding with meaningful blast radius. Address in this operational window.',
  medium: 'Material weakness that raises risk. Plan remediation in the next hardening pass.',
  low: 'Minor weakness or hygiene item. Track and fix when schedule allows.',
  informational: 'Context, best-practice note, or inert observation. No immediate action required.',
};
const severitySortOrder = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
const statusTones = { needs_review: 'amber', in_progress: 'blue', fixed: 'green', accepted_risk: 'yellow' };
const statusLabels = { needs_review: 'Needs review', in_progress: 'In progress', fixed: 'Fixed', accepted_risk: 'Accepted risk' };
>>>>>>> 0f0fa96 (Add managed machine credential UI refinements)

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

<<<<<<< HEAD
export default async function Remediation() {
  noStore();
  const remediations = await apiGet('/remediation');
  const machineGroups = groupByMachine(remediations);
=======
function readableText(value, fallback = '') {
  if (typeof value === 'string') return value === '[object Object]' ? fallback : value;
  if (value == null) return fallback;
  if (Array.isArray(value)) return value.map((item) => readableText(item)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const primary = value.instruction || value.action || value.recommendation || value.remediation || value.description || value.summary || value.title;
    const parts = [readableText(primary, fallback)];
    if (value.file_path) parts.push(`File: ${value.file_path}`);
    if (value.command) parts.push(`Command: ${value.command}`);
    return parts.filter(Boolean).join('\n') || fallback;
  }
  return String(value);
}

function remediationText(finding) {
  return readableText(
    finding.remediation_action || finding.remediation_instructions || finding.remediation_title,
    'Review evidence, apply the recommended hardening step, then rerun the scan.',
  );
}

function groupFindingsByMachine(findings) {
  const groups = [];
  const machineMap = new Map();
  for (const finding of findings) {
    const machine = finding.subject_name || 'Unknown';
    if (!machineMap.has(machine)) machineMap.set(machine, []);
    machineMap.get(machine).push(finding);
  }
  for (const [machine, machineItems] of machineMap) {
    const items = machineItems.sort((a, b) => {
      const aSeverity = severitySortOrder[String(a.severity || 'informational').toLowerCase()] ?? 99;
      const bSeverity = severitySortOrder[String(b.severity || 'informational').toLowerCase()] ?? 99;
      if (aSeverity !== bSeverity) return aSeverity - bSeverity;
      const statusOrder = { needs_review: 0, in_progress: 1, open: 2, accepted_risk: 3, fixed: 4 };
      return (statusOrder[String(a.remediation_status).toLowerCase()] ?? 99) - (statusOrder[String(b.remediation_status).toLowerCase()] ?? 99);
    });
    const severityCounts = items.reduce((acc, finding) => {
      const sev = String(finding.severity || 'informational').toLowerCase();
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});
    const summaryFindings = items.slice(0, 3).map((finding) => ({
      id: finding.id,
      title: finding.title,
      severity: String(finding.severity || 'informational').toLowerCase(),
      status: String(finding.remediation_status || 'open').toLowerCase(),
    }));
    groups.push({
      machine,
      count: items.length,
      severityCounts,
      summaryFindings,
      items,
    });
  }
  groups.sort((a, b) => a.machine.localeCompare(b.machine));
  return groups;
}

export default async function Remediation({ searchParams }) {
  const statusFilter = searchParams?.status || null;
  const severityFilter = searchParams?.severity || 'All severities';
  const envFilter = searchParams?.env || 'All environments';
  const ownerFilter = searchParams?.owner || 'All owners';
  const [findings, statusCounts] = await Promise.all([
    getJson('/findings', []),
    getJson('/remediations/status-counts', { needs_review: 0, in_progress: 0, fixed: 0, accepted_risk: 0 }),
  ]);

  const filteredFindings = filterFindings(findings, { severity: severityFilter, status: statusFilter, env: envFilter, owner: ownerFilter });
  const clearHref = routePath('/remediation');

  const topFinding = filteredFindings.length
    ? filteredFindings.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };
        return (order[String(a.severity).toLowerCase()] ?? 99) - (order[String(b.severity).toLowerCase()] ?? 99);
      })[0]
    : null;

  const groupedFindings = groupFindingsByMachine(filteredFindings);

  const totalRemediations = Object.values(statusCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const filteredCount = filteredFindings.length;
  const isFiltered = filteredCount !== findings.length;
>>>>>>> 0f0fa96 (Add managed machine credential UI refinements)

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
<<<<<<< HEAD
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
=======
          </div>
          <div className="top-rec-actions">
            <Link className="btn" href={routePath(`/scans-reports/reports/${topFinding.run_id}`)}>Open evidence</Link>
            {topFinding.remediation_id ? (
              <Link className="btn alt" href={routePath(`/remediation/${topFinding.remediation_id}`)}>View full details</Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel">
        <header><div><h2>Remediation queue</h2><p>Create remediation tasks from scanner recommendations or review suggested remediation directly from the scan evidence. Machines are the primary choice on this page; click a machine to open its remediation options and evidence.</p></div><Pill>{filteredCount} findings</Pill></header>
        {filteredFindings.length ? (
          <div className="finding-list finding-list--machine-first" data-testid="remediation-list">
            {groupedFindings.map((group) => (
              <details key={group.machine} className="machine-group machine-group--card" data-testid={`machine-group-${group.machine}`}>
                <summary className="machine-group-header machine-group-header--card">
                  <span className="machine-dot" aria-hidden="true" />
                  <div>
                    <h3>{group.machine}</h3>
                    <p>{group.count} finding{group.count === 1 ? '' : 's'} · click to view remediation options and evidence</p>
                    <div className="machine-summary-findings" aria-label={`${group.machine} summary findings`}>
                      {group.summaryFindings.map((finding) => (
                        <span key={finding.id} className="machine-summary-finding">
                          <Pill tone={severityTone[finding.severity] || ''}>{finding.severity}</Pill>
                          <span>{finding.title}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="machine-count">{group.count}</span>
                </summary>
                <div className="machine-group-body">
                  <div className="machine-severity-badges" aria-label={`${group.machine} severity summary`}>
                    {severityOrder.map((severity) => group.severityCounts[severity] ? (
                      <Pill key={severity} tone={severityTone[severity] || ''}>{severity} · {group.severityCounts[severity]}</Pill>
                    ) : null)}
                  </div>
                  <div className="machine-finding-stack">
                    {group.items.map((finding) => (
                      <article className="finding-row machine-finding-row" key={finding.id} data-testid="remediation-row" data-status={finding.remediation_status || 'open'}>
                        <div>
                          <div className="finding-row-kicker">
                            <Pill tone={severityTone[finding.severity] || ''}>{finding.severity}</Pill>
                            <Pill tone={statusTones[finding.remediation_status] || ''} data-testid="row-status">{statusLabels[finding.remediation_status] || finding.remediation_status || 'open'}</Pill>
                          </div>
                          <h4>{finding.title}</h4>
                          <p>{finding.description || finding.evidence_summary || 'Scanner evidence is available in the report artifacts.'}</p>
                          <small>Suggested remediation: {remediationText(finding)}</small>
                          <small>Plan owner: {finding.owner_name || 'Unassigned'} · Due date: {finding.due_date || 'Unassigned'}</small>
                          {finding.evidence_artifact_type ? <small>Evidence attachment: {finding.evidence_artifact_type}</small> : null}
                        </div>
                        <aside>
                          <Link className="btn alt" href={routePath(`/scans-reports/reports/${finding.run_id}`)}>Open evidence</Link>
                          {finding.remediation_id ? (
                            <Link className="btn" href={routePath(`/remediation/${finding.remediation_id}`)}>View details</Link>
                          ) : null}
                        </aside>
>>>>>>> 0f0fa96 (Add managed machine credential UI refinements)
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
