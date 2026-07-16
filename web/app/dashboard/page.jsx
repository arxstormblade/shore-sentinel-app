import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import {
  CompactPageHeader,
  ComposedEmptyState,
  OperationsLedger,
  OperationsLedgerRow,
  OperationsSummaryStrip,
  OperationalSection,
  Pill,
} from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const severityOrder = ['critical', 'high', 'medium', 'low'];
const severityColors = {
  critical: '#ff6677',
  high: '#ffad66',
  medium: '#f4d35e',
  low: '#5bd6a2',
};

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

  const latestReports = reports.slice(0, 5);
  const severityCounts = severityOrder.map((severity) => ({
    label: severity[0].toUpperCase() + severity.slice(1),
    key: severity,
    value: remediations.filter((item) => String(item.severity || '').toLowerCase() === severity).length,
  }));
  const totalFindings = severityCounts.reduce((sum, item) => sum + item.value, 0);
  const openRemediations = remediations.filter((item) => !['resolved', 'closed', 'accepted'].includes(String(item.status || '').toLowerCase())).length;
  const priorityMachines = targets.filter((target) => Number(target.remediation_count || 0) > 0).slice(0, 5);
  let severityCursor = 0;
  const severitySegments = severityCounts.map((item) => {
    const start = totalFindings ? Math.round((severityCursor / totalFindings) * 100) : 0;
    severityCursor += item.value;
    const end = totalFindings ? Math.round((severityCursor / totalFindings) * 100) : 100;
    return `${severityColors[item.key]} ${start}% ${end}%`;
  }).join(', ');

  return (
    <div className="operations-page dashboard-operations-page" data-view="Managed-machine dashboard">
      <CompactPageHeader
        eyebrow="Fleet operations"
        title="Managed machine briefing"
        description="Review current fleet risk, prioritize machines needing attention, and keep evidence moving."
        actions={(
          <>
            <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>
            <Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link>
          </>
        )}
      />

      <OperationsSummaryStrip
        items={[
          { label: 'Managed machines', value: targets.length },
          { label: 'Open remediation', value: openRemediations },
          { label: 'Findings', value: totalFindings },
          { label: 'Reports', value: reports.length },
          { label: 'Latest report', value: latestReports[0] ? formatDate(latestReports[0].completed_at || latestReports[0].started_at) : 'Not recorded' },
          { label: 'Priority machines', value: priorityMachines.length },
        ]}
      />

      <OperationalSection
        id="priority-machines"
        eyebrow="Triage queue"
        title="Machines needing attention"
        status={<Pill tone={openRemediations ? 'red' : 'green'}>{openRemediations ? `${openRemediations} open items` : 'No open items'}</Pill>}
        actions={<Link href={routePath('/inventory')}>Open inventory</Link>}
      >
        {priorityMachines.length ? (
          <OperationsLedger label="Priority managed machines">
            {priorityMachines.map((machine) => (
              <OperationsLedgerRow key={machine.id}>
                <div className="operations-row-copy">
                  <b>{machine.name || machine.hostname || 'Managed machine'}</b>
                  <span>{machine.owner || 'Unassigned owner'} · {machine.env || 'Unassigned environment'}</span>
                </div>
                <div className="operations-row-actions">
                  <Pill tone="red">{machine.remediation_count} open remediation</Pill>
                  <Link href={routePath(`/inventory/machines/${machine.id}`)}>Open dossier</Link>
                </div>
              </OperationsLedgerRow>
            ))}
          </OperationsLedger>
        ) : (
          <ComposedEmptyState
            title="No machines currently need remediation"
            description="Enroll a machine or review the latest reports to keep the fleet posture current."
            actions={<Link className="btn alt" href={routePath('/inventory')}>View inventory</Link>}
          />
        )}
      </OperationalSection>

      <OperationalSection
        id="severity-summary"
        eyebrow="Live risk mix"
        title="Findings by severity"
        status={<Pill>{totalFindings} total findings</Pill>}
      >
        <div className="severity-briefing">
          <div className="severity-chart" role="img" aria-label={`Live severity distribution: ${severityCounts.map((item) => `${item.label} ${item.value}`).join(', ')}`} style={{ background: totalFindings ? `conic-gradient(${severitySegments})` : 'var(--panel)' }} />
          <OperationsLedger label="Severity counts">
            {severityCounts.map((item) => (
              <OperationsLedgerRow key={item.key}>
                <div className="operations-row-copy">
                  <b>{item.label}</b>
                  <span>{totalFindings ? `${Math.round((item.value / totalFindings) * 100)}% of current findings` : 'No current findings'}</span>
                </div>
                <Pill tone={item.key === 'critical' ? 'red' : item.key === 'high' ? 'orange' : item.key === 'medium' ? 'yellow' : 'green'}>{item.value} findings</Pill>
              </OperationsLedgerRow>
            ))}
          </OperationsLedger>
        </div>
      </OperationalSection>

      <OperationalSection
        id="recent-reports"
        eyebrow="Evidence activity"
        title="Recent scanner reports"
        actions={<Link href={routePath('/scans-reports')}>View all reports</Link>}
      >
        {latestReports.length ? (
          <OperationsLedger label="Recent scanner reports">
            {latestReports.map((report) => (
              <OperationsLedgerRow key={report.id}>
                <div className="operations-row-copy">
                  <b>{report.title || report.source || 'Scanner report'}</b>
                  <span>{formatDate(report.completed_at || report.started_at)} · {report.finding_count || 0} findings</span>
                </div>
                <div className="operations-row-actions">
                  <Pill tone={String(report.status || '').toLowerCase() === 'failed' ? 'red' : 'green'}>{statusLabel(report.status)}</Pill>
                  <Link href={routePath(`/scans-reports/reports/${report.id}`)}>Open report</Link>
                </div>
              </OperationsLedgerRow>
            ))}
          </OperationsLedger>
        ) : (
          <ComposedEmptyState
            title="No managed scan reports yet"
            description="Enroll a managed machine, then launch its first scan to generate evidence."
            actions={<Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>}
          />
        )}
      </OperationalSection>
    </div>
  );
}