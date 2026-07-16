import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { CompactPageHeader, OperationalSection, OperationsDisclosure, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, Pill } from '@/components/ui';
import { appPath, routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';
import { getAuthenticatedUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RemediationDetail({ params }) {
  noStore();
  const { id } = await params;
  let item;
  try {
    item = await apiGet('/remediation/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }
  const activityPayload = await apiGet('/remediations/' + id + '/activity').catch(() => ({ activity: [] }));
  const activity = Array.isArray(activityPayload.activity) ? activityPayload.activity : [];
  const user = await getAuthenticatedUser();
  const canEditStatus = Array.isArray(user?.roles) && user.roles.some((role) => ['admin', 'operator', 'analyst'].includes(String(role).toLowerCase()));

  return (
    <div className="operations-page remediation-dossier-page">
      <CompactPageHeader eyebrow="Remediation dossier" title={item.title || item.finding_title} description={item.guidance || item.action || item.description || 'Review scanner evidence before closing this item.'} status={<><Pill>{item.severity || 'informational'}</Pill><Pill>{item.status}</Pill></>} actions={<Link className="btn alt" href={routePath('/remediation')}>Remediation queue</Link>} />
      <OperationsSummaryStrip items={[{ label: 'Status', value: item.status }, { label: 'Owner', value: item.owner }, { label: 'Environment', value: item.env }, { label: 'Machine', value: item.asset }]} />
      <OperationalSection eyebrow="Workflow" title="Status and ownership"><OperationsLedger label="Remediation workflow"><OperationsLedgerRow><div className="operations-row-copy"><b>Update remediation status</b><span>{canEditStatus ? 'Status changes are recorded in the activity trail.' : 'Your role has read-only access to remediation status.'}</span></div>{canEditStatus ? <form className="compact-inline-form" action={appPath(`/api/remediations/${item.id}/status`)} method="post"><label className="sr-only" htmlFor="remediation-status">Status</label><select id="remediation-status" name="status" defaultValue={item.status}><option value="open">Open</option><option value="accepted">Accepted risk</option><option value="ignored">Ignored</option><option value="resolved">Resolved</option></select><button className="btn" type="submit">Save status</button></form> : <Pill>Read only</Pill>}</OperationsLedgerRow><OperationsLedgerRow><div className="operations-row-copy"><b>Managed machine</b><span>{item.asset} · {item.env}</span></div>{item.machine_id ? <Link className="btn alt" href={routePath('/inventory/machines/' + item.machine_id)}>Open machine</Link> : null}</OperationsLedgerRow></OperationsLedger></OperationalSection>
      <OperationalSection eyebrow="Evidence" title="Evidence-first closure"><OperationsDisclosure summary="Review supporting evidence" defaultOpen><p>{item.evidence_summary || 'Close only after a rerun report confirms resolution or formal acceptance.'}</p>{item.run_id ? <Link className="btn alt" href={routePath('/scans-reports/reports/' + item.run_id)}>Open source report</Link> : null}</OperationsDisclosure></OperationalSection>
      <OperationalSection eyebrow="Audit trail" title="Activity" status={<Pill>{activity.length}</Pill>}>{activity.length === 0 ? <p className="compact-empty-note">No activity has been recorded for this remediation item.</p> : <OperationsLedger label="Remediation activity">{activity.map((entry) => <OperationsLedgerRow key={entry.id}><div className="operations-row-copy"><b>{entry.event_type || 'Remediation event'}</b><span>{entry.actor_name || 'System'} · {entry.created_at}</span></div></OperationsLedgerRow>)}</OperationsLedger>}</OperationalSection>
    </div>
  );
}
