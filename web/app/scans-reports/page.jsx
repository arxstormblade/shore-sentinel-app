import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsSummaryStrip, Pill } from '@/components/ui';
import { ReportsLedger } from '@/components/reports-ledger-client';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Scans() {
  noStore();
  const reports = await apiGet('/reports');
  const completedReports = reports.filter((report) => String(report.status).toLowerCase() === 'completed');

  return (
    <div className="operations-page reports-page">
      <CompactPageHeader eyebrow="Evidence ledger" title="Scans and reports" description="Review execution history, findings, and downloadable evidence without losing the managed-machine context." status={<Pill>{reports.length} report{reports.length === 1 ? '' : 's'}</Pill>} actions={<Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>} />
      <OperationsSummaryStrip items={[{ label: 'Reports', value: reports.length }, { label: 'Completed', value: completedReports.length }, { label: 'Active', value: reports.length - completedReports.length }, { label: 'Findings', value: reports.reduce((total, report) => total + Number(report.finding_count || 0), 0) }]} />
      {reports.length === 0 ? (
        <ComposedEmptyState title="No scan reports yet" description="Enroll a managed machine to begin recurring monitoring and collect evidence." actions={<Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>} />
      ) : (
        <OperationalSection eyebrow="Report register" title="Evidence by scan" status={<Pill>Filterable</Pill>}><ReportsLedger reports={reports} /></OperationalSection>
      )}
    </div>
  );
}
