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
const severityRank = (severity) => {
  const index = severityOrder.indexOf(String(severity || 'informational').toLowerCase());
  return index === -1 ? 99 : index;
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

function groupFindingsByMachine(findings) {
  const statusOrder = { needs_review: 0, in_progress: 1, open: 2, accepted_risk: 3, fixed: 4 };
  const groups = new Map();

  for (const finding of findings) {
    const machine = finding.subject_name || 'Unknown machine';
    const existing = groups.get(machine) || {
      machine,
      env: finding.environment_name || finding.environment || 'Unknown environment',
      owner: finding.owner_name || 'Unassigned owner',
      findings: [],
      severityCounts: {},
      openCount: 0,
      highestSeverity: 'informational',
    };
    const severity = String(finding.severity || 'informational').toLowerCase();
    existing.findings.push(finding);
    existing.severityCounts[severity] = (existing.severityCounts[severity] || 0) + 1;
    if (!['fixed', 'accepted_risk'].includes(String(finding.remediation_status || '').toLowerCase())) existing.openCount += 1;
    if (severityRank(severity) < severityRank(existing.highestSeverity)) {
      existing.highestSeverity = severity;
    }
    groups.set(machine, existing);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    findings: group.findings.sort((a, b) => {
      const severityDelta = severityRank(a.severity) - severityRank(b.severity);
      if (severityDelta) return severityDelta;
      return (statusOrder[String(a.remediation_status).toLowerCase()] ?? 99) - (statusOrder[String(b.remediation_status).toLowerCase()] ?? 99);
    }),
  })).sort((a, b) => {
    const severityDelta = severityRank(a.highestSeverity) - severityRank(b.highestSeverity);
    if (severityDelta) return severityDelta;
    return b.openCount - a.openCount || a.machine.localeCompare(b.machine);
  });
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

  const machineGroups = groupFindingsByMachine(filteredFindings);

  const totalRemediations = Object.values(statusCounts).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const filteredCount = filteredFindings.length;
  const isFiltered = filteredCount !== findings.length;

  return (
    <div className="stack">
      <Header eye="Remediation" title="Machine remediation queue" desc="Choose a machine first. Review summary findings, then expand the machine to see remediation options and evidence.">
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

      <Filters name="Remediation" items={['Machine', 'Severity', 'Status', 'Environment', 'Owner']} />


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

      <section className="panel machine-remediation-panel">
        <header>
          <div>
            <h2>Machines with findings</h2>
            <p>Summary findings stay visible. Remediation guidance, evidence, and detail links appear after you open a machine.</p>
          </div>
          <Pill>{filteredCount} findings</Pill>
        </header>
        {filteredFindings.length ? (
          <div className="machine-remediation-list" data-testid="remediation-list">
            {machineGroups.map((group) => (
              <details className="machine-remediation-card" key={group.machine} data-testid={`machine-group-${group.machine}`}>
                <summary className="machine-remediation-summary" aria-label={`${group.machine}: ${group.findings.length} findings, ${group.openCount} open items`}>
                  <span className="machine-summary-main">
                    <span className={`status-dot ${severityTone[group.highestSeverity] || ''}`} aria-hidden="true" />
                    <span>
                      <b>{group.machine}</b>
                      <small>{group.env} · {group.owner}</small>
                    </span>
                  </span>
                  <span className="machine-summary-findings">
                    {group.findings.slice(0, 3).map((finding) => (
                      <span className="machine-summary-finding" key={finding.id}>{finding.title}</span>
                    ))}
                  </span>
                  <span className="machine-summary-meta">
                    <Pill>{group.findings.length} finding{group.findings.length === 1 ? '' : 's'}</Pill>
                    {severityOrder.filter((severity) => group.severityCounts[severity]).map((severity) => (
                      <Pill tone={severityTone[severity] || ''} key={severity}>{group.severityCounts[severity]} {severity}</Pill>
                    ))}
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
                    {group.findings.map((finding) => (
                      <article className="finding-row machine-finding-row" key={finding.id} data-testid="remediation-row" data-status={finding.remediation_status || 'open'}>
                        <div>
                          <small className="finding-row-kicker">{finding.severity} · {statusLabels[finding.remediation_status] || finding.remediation_status || 'open'}</small>
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
                </div>
              </details>
            ))}
          </div>
        ) : <div className="empty" data-testid="remediation-empty-state"><h3>No actionable findings match filters</h3><p>Try adjusting your filters to see more results, or clear them to view all findings.</p><div className="empty-actions"><Link className="btn" href={clearHref}>Clear filters</Link></div></div>}
      </section>
    </div>
  );
}
