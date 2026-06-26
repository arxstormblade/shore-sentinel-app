import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { filterFindings } from '@/lib/filters';
import { routePath } from '@/lib/paths';

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
const statusTones = { needs_review: 'amber', in_progress: 'blue', fixed: 'green', accepted_risk: 'yellow' };
const statusLabels = { needs_review: 'Needs review', in_progress: 'In progress', fixed: 'Fixed', accepted_risk: 'Accepted risk' };

async function getJson(path, fallback) {
  try {
    const response = await fetch(`${serverApiBase()}${path}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

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

function groupFindingsBySeverityAndMachine(findings) {
  const groups = [];
  const severityMap = new Map();
  for (const finding of findings) {
    const sev = String(finding.severity || 'informational').toLowerCase();
    if (!severityMap.has(sev)) severityMap.set(sev, []);
    severityMap.get(sev).push(finding);
  }
  for (const sev of severityOrder) {
    const items = severityMap.get(sev);
    if (!items || items.length === 0) continue;
    const machineMap = new Map();
    for (const item of items) {
      const machine = item.subject_name || 'Unknown';
      if (!machineMap.has(machine)) machineMap.set(machine, []);
      machineMap.get(machine).push(item);
    }
    const machineGroups = [];
    for (const [machine, machineItems] of machineMap) {
      machineGroups.push({ machine, items: machineItems.sort((a, b) => {
        const statusOrder = { needs_review: 0, in_progress: 1, open: 2, accepted_risk: 3, fixed: 4 };
        return (statusOrder[String(a.remediation_status).toLowerCase()] ?? 99) - (statusOrder[String(b.remediation_status).toLowerCase()] ?? 99);
      }) });
    }
    machineGroups.sort((a, b) => a.machine.localeCompare(b.machine));
    groups.push({ severity: sev, count: items.length, machineGroups });
  }
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

  const groupedFindings = groupFindingsBySeverityAndMachine(filteredFindings);

  const totalRemediations = Object.values(statusCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const filteredCount = filteredFindings.length;
  const isFiltered = filteredCount !== findings.length;

  return (
    <div className="stack">
      <Header eye="Remediation" title="Actionable findings" desc="Turn scanner findings into clear remediation work. Create remediation tasks from scanner recommendations or review suggested remediation directly from the scan evidence. Each row tracks status through review, fix, and accept-risk workflow.">
        <Pill data-testid="remediation-total-count">{totalRemediations} item{totalRemediations === 1 ? '' : 's'}</Pill>
      </Header>

      <section className="status-board" aria-label="Remediation status counts" data-testid="remediation-status-counts">
        <div className="status-count-card" data-status="needs_review">
          <strong>{statusCounts.needs_review}</strong>
          <span>Needs review</span>
        </div>
        <div className="status-count-card" data-status="in_progress">
          <strong>{statusCounts.in_progress}</strong>
          <span>In progress</span>
        </div>
        <div className="status-count-card" data-status="fixed">
          <strong>{statusCounts.fixed}</strong>
          <span>Fixed</span>
        </div>
        <div className="status-count-card" data-status="accepted_risk">
          <strong>{statusCounts.accepted_risk}</strong>
          <span>Accepted risk</span>
        </div>
      </section>

      <div aria-live="polite" className="result-summary" data-testid="remediation-result-summary">
        {statusFilter ? `Showing ${statusLabels[statusFilter] || statusFilter} items` : `Showing all ${findings.length} findings`}
        {isFiltered ? ' · ' : null}
        {isFiltered ? <a className="btn-link" href={clearHref}>Clear filters</a> : null}
      </div>

      <Filters name="Remediation" items={['Severity', 'Status', 'Environment', 'Owner']} />


      {topFinding ? (
        <section className="panel top-recommendation" data-testid="top-recommendation" aria-label="Top recommended action">
          <div className="top-rec-content">
            <span className={`status-dot ${severityTone[topFinding.severity] || ''}`} aria-hidden="true" />
            <div>
              <h2>Top recommended action</h2>
              <p className="top-rec-title">{topFinding.title}</p>
              <p className="top-rec-subject">{topFinding.subject_name} · <span title={severityExplanations[topFinding.severity] || 'Severity reflects scanner-assessed impact and confidence.'}>{topFinding.severity}</span></p>
              <p className="top-rec-detail">{remediationText(topFinding)}</p>
              <p className="top-rec-why">Recommended first because it is the highest-severity open finding with the most impactful blast radius on the fleet.</p>
              {topFinding.remediation_status ? (
                <Pill tone={statusTones[topFinding.remediation_status] || ''} data-testid="top-rec-status">{statusLabels[topFinding.remediation_status] || topFinding.remediation_status}</Pill>
              ) : null}
            </div>
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
        <header><div><h2>Remediation queue</h2><p>Create remediation tasks from scanner recommendations or review suggested remediation directly from the scan evidence. Findings are grouped by severity and machine for triage.</p></div><Pill>{filteredCount} findings</Pill></header>
        {filteredFindings.length ? (
          <div className="finding-list" data-testid="remediation-list">
            {groupedFindings.map((group) => (
              <div key={group.severity} className="severity-group" data-testid={`severity-group-${group.severity}`}>
                <div className="severity-group-header" tabIndex={0} role="group" aria-label={`${group.severity} severity: ${group.count} findings across ${group.machineGroups.length} machine${group.machineGroups.length === 1 ? '' : 's'}`}>
                  <span className={`status-dot ${severityTone[group.severity] || ''}`} aria-hidden="true" />
                  <h3>{group.severity} <span className="group-count">{group.count} findings</span></h3>
                  <span className="group-machine-count">{group.machineGroups.length} machine{group.machineGroups.length === 1 ? '' : 's'}</span>
                </div>
                {group.machineGroups.map((machineGroup) => (
                  <div key={machineGroup.machine} className="machine-group" data-testid={`machine-group-${machineGroup.machine}`}>
                    <div className="machine-group-header">
                      <span className="machine-dot" aria-hidden="true" />
                      <h4>{machineGroup.machine}</h4>
                      <span className="machine-count">{machineGroup.items.length}</span>
                    </div>
                    {machineGroup.items.map((finding) => (
                      <article className="finding-row machine-finding-row" key={finding.id} data-testid="remediation-row" data-status={finding.remediation_status || 'open'}>
                        <div>
                          <h3>{finding.title}</h3>
                          <p>{finding.description || finding.evidence_summary || 'Scanner evidence is available in the report artifacts.'}</p>
                          <small>Suggested remediation: {remediationText(finding)}</small>
                          <small>Plan owner: {finding.owner_name || 'Unassigned'} · Due date: {finding.due_date || 'Unassigned'}</small>
                          {finding.evidence_artifact_type ? <small>Evidence attachment: {finding.evidence_artifact_type}</small> : null}
                        </div>
                        <aside>
                          <Pill tone={severityTone[finding.severity] || ''}>{finding.severity}</Pill>
                          <Pill tone={statusTones[finding.remediation_status] || ''} data-testid="row-status">{statusLabels[finding.remediation_status] || finding.remediation_status || 'open'}</Pill>
                          <Link className="btn alt" href={routePath(`/scans-reports/reports/${finding.run_id}`)}>Open evidence</Link>
                          {finding.remediation_id ? (
                            <Link className="btn" href={routePath(`/remediation/${finding.remediation_id}`)}>View details</Link>
                          ) : null}
                        </aside>
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : <div className="empty" data-testid="remediation-empty-state"><h3>No actionable findings match filters</h3><p>Try adjusting your filters to see more results, or clear them to view all findings.</p><div className="empty-actions"><Link className="btn" href={clearHref}>Clear filters</Link></div></div>}
      </section>
    </div>
  );
}
