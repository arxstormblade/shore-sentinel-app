import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

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

  return (
    <div className="stack">
      <Header eye="Remediation item" title={item.title || item.finding_title} desc={item.guidance || item.action || item.description || 'Review scanner evidence before closing this item.'}>
        <Pill>{item.severity || 'informational'}</Pill>
        <Pill>{item.status}</Pill>
      </Header>

      <section className="grid">
        <article className="panel">
          <h2>Workflow</h2>
          <p>Status: {item.status}</p>
          <p>Owner: {item.owner}</p>
          <p>Environment: {item.env}</p>
          <p>Machine: {item.asset}</p>
          {item.machine_id ? <p><Link href={routePath('/inventory/machines/' + item.machine_id)}>Open machine</Link></p> : null}
        </article>
        <article className="panel">
          <h2>Evidence-first closure</h2>
          <p>{item.evidence_summary || 'Close only after a rerun report confirms resolution or formal acceptance.'}</p>
          {item.run_id ? <p><Link href={routePath('/scans-reports/reports/' + item.run_id)}>Open source report</Link></p> : null}
        </article>
      </section>
    </div>
  );
}
