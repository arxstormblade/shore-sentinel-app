import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsDisclosure, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Audit({ params }) {
  noStore();
  const { id } = await params;
  let audit;
  try {
    audit = await apiGet('/one-time-audits/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }

  const reports = await apiGet('/reports').catch(() => []);
  const auditReports = reports.filter((report) => (report.audit_id || report.auditId) === audit.id);

  return (
    <div className="operations-page audit-dossier-page">
      <CompactPageHeader eyebrow="Historical one-time audit" title={audit.display_name || audit.hostname || 'Standalone audit'} description="Read-only historical evidence from a standalone scanner run. New one-time audits are run locally from the GitHub scanner bundle." status={<Pill>{audit.status || 'unknown'}</Pill>} actions={<Link className="btn alt" href={routePath('/inventory/new')}>Promote to Managed Machine</Link>} />
      <OperationsSummaryStrip items={[{ label: 'Asset mode', value: 'One-time audit' }, { label: 'Connection', value: audit.connection_mode || 'Not recorded' }, { label: 'Reports', value: auditReports.length }, { label: 'Status', value: audit.status || 'unknown' }]} />
      <OperationalSection eyebrow="Record details" title="Audit details"><OperationsLedger label="Historical audit details"><OperationsLedgerRow><div className="operations-row-copy"><b>Hostname</b><span>{audit.hostname || 'Not recorded'}</span></div></OperationsLedgerRow><OperationsLedgerRow><div className="operations-row-copy"><b>IP address</b><span>{audit.ip_address || 'Not recorded'}</span></div></OperationsLedgerRow><OperationsLedgerRow><div className="operations-row-copy"><b>Connection</b><span>{audit.connection_mode || 'Not recorded'}</span></div></OperationsLedgerRow></OperationsLedger></OperationalSection>
      <OperationalSection eyebrow="Evidence posture" title="Read-only historical evidence" status={<Pill>Archive only</Pill>}><OperationsDisclosure summary="Why this record is read-only" defaultOpen><p>This record is retained for historical review and cannot be created or rerun from the app. Open a linked report to review its retained scanner artifacts.</p></OperationsDisclosure></OperationalSection>
      <OperationalSection eyebrow="Linked evidence" title="Audit reports" status={<Pill>{auditReports.length}</Pill>}>
        {auditReports.length === 0 ? <ComposedEmptyState title="No retained reports are linked" description="This historical record has no report artifacts available in the evidence ledger." /> : <OperationsLedger label="Reports linked to this audit">{auditReports.map((report) => <OperationsLedgerRow key={report.id}><div className="operations-row-copy"><b>{report.title || 'Standalone audit report'}</b><span>{report.created_at}</span></div><div className="operations-row-actions"><Pill>{report.status}</Pill><Link className="btn alt" href={routePath('/scans-reports/reports/' + report.id)}>Open report and artifacts</Link></div></OperationsLedgerRow>)}</OperationsLedger>}
      </OperationalSection>
    </div>
  );
}
