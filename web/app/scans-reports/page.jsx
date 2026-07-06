import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Scans() {
  noStore();
  const reports = await apiGet('/reports');

  return (
    <div className="stack">
      <Header eye="Scans & Reports" title="Run scans, follow progress, review reports" desc="Execution, history, and report viewing share this surface. Comparison and import/export stay in secondary actions.">
        <Link id="audit-entry" className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <Filters name="Scans & Reports" items={['Severity', 'Time range', 'Environment']} />
      <p className="note">API list: {apiBase}/reports</p>
      {reports.length === 0 ? (
        <Empty />
      ) : (
        <section className="panel">
          {reports.map((r) => (
            <Link className="row" href={routePath('/scans-reports/reports/' + r.id)} key={r.id}>
              <span>
                <b>{r.title} scan report</b>
                <small>{r.source} · {r.env} · {r.finding_count || 0} findings</small>
              </span>
              <Pill>{r.status}</Pill>
              <Pill>{r.severity}</Pill>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
