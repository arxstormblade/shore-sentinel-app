import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Audits() {
  noStore();
  const audits = await apiGet('/one-time-audits');

  return (
    <div className="operations-page audit-archive-page">
      <CompactPageHeader eyebrow="Historical evidence" title="Audit archive" description="Use this read-only archive for legacy evidence and temporary target reviews. New local scanner runs are distributed from GitHub, not created in the app." status={<Pill>{audits.length} record{audits.length === 1 ? '' : 's'}</Pill>} />
      <OperationsSummaryStrip items={[{ label: 'Archived records', value: audits.length }, { label: 'Completed', value: audits.filter((audit) => String(audit.status).toLowerCase() === 'completed').length }, { label: 'Other status', value: audits.filter((audit) => String(audit.status).toLowerCase() !== 'completed').length }]} />
      {audits.length === 0 ? (
        <ComposedEmptyState title="No legacy audit records" description="This archive retains historical evidence only. Enroll a managed machine for new monitoring." actions={<Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>} />
      ) : (
        <OperationalSection eyebrow="Legacy archive" title="Read-only audit records" status={<Pill>Read-only</Pill>}>
          <OperationsLedger label="Historical audit records">
          {audits.map((a) => (
            <OperationsLedgerRow key={a.id}>
              <div className="operations-row-copy">
                <b>{a.target || a.display_name}</b>
                <span>{a.hostname || a.ip_address || 'Temporary audit target'} · {a.connection_mode || 'Connection not recorded'}</span>
              </div>
              <div className="operations-row-actions"><Pill>{a.status || 'unknown'}</Pill><Link className="btn alt" href={routePath('/audits/' + a.id)}>Open archive</Link></div>
            </OperationsLedgerRow>
          ))}
          </OperationsLedger>
        </OperationalSection>
      )}
    </div>
  );
}
