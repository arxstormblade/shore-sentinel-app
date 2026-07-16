import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsSummaryStrip, Pill } from '@/components/ui';
import { RemediationQueue } from '@/components/remediation-queue-client';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Remediation() {
  noStore();
  const remediations = await apiGet('/remediation');
  const openCount = remediations.filter((item) => ['open', 'accepted'].includes(String(item.status).toLowerCase())).length;
  const machineCount = new Set(remediations.map((item) => item.asset || 'Unassigned machine')).size;

  return (
    <div className="operations-page remediation-page">
      <CompactPageHeader eyebrow="Remediation ledger" title="Machine remediation queue" description="Filter by severity, status, and environment. Open a machine only when you need the supporting evidence and action." status={<Pill>{openCount} open</Pill>} actions={<Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link>} />
      <OperationsSummaryStrip items={[{ label: 'Items', value: remediations.length }, { label: 'Open', value: openCount }, { label: 'Machines', value: machineCount }, { label: 'Critical', value: remediations.filter((item) => String(item.severity).toLowerCase() === 'critical').length }]} />
      {remediations.length === 0 ? (
        <ComposedEmptyState title="No remediation items yet" description="Completed scans with findings will add evidence-backed remediation work here." actions={<Link className="btn" href={routePath('/scans-reports')}>View reports</Link>} />
      ) : (
        <OperationalSection eyebrow="Evidence queue" title="Items by managed machine" status={<Pill>Filterable</Pill>}><RemediationQueue items={remediations} /></OperationalSection>
      )}
    </div>
  );
}
