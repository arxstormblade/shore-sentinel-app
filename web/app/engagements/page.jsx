import Link from 'next/link';
import { apiGet } from '@/lib/api-data';
import { getAuthenticatedUser } from '@/lib/session';
import { CompactPageHeader, OperationsLedger, OperationsLedgerRow, Pill } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function EngagementsPage() {
  const user = await getAuthenticatedUser();
  if (!user) return null;
  let engagements = [];
  let unavailable = false;
  try { engagements = await apiGet('/engagements'); } catch { unavailable = true; }
  return <main className="page-stack">
    <CompactPageHeader eyebrow="Authorization control" title="Engagements" description="Every execution requires active owner authorization, bounded scope, dual approval, and policy decision evidence." actions={<Link className="button button-primary" href="/policies">Review policies</Link>} />
    {unavailable ? <p className="notice notice-warning" role="status">Engagement data is temporarily unavailable.</p> : <OperationsLedger>
      {(Array.isArray(engagements) ? engagements : []).map((engagement) => <OperationsLedgerRow key={engagement.id}><div><strong>{engagement.name}</strong><span>{engagement.owner_team} · expires {String(engagement.expires_at).slice(0, 19)}</span></div><Pill tone={engagement.revoked_at ? 'danger' : engagement.owner_authorized ? 'success' : 'warning'}>{engagement.revoked_at ? 'Revoked' : engagement.owner_authorized ? 'Owner approved' : 'Pending owner approval'}</Pill></OperationsLedgerRow>)}
      {!engagements.length && <p className="empty-state">No engagements recorded.</p>}
    </OperationsLedger>}
  </main>;
}
