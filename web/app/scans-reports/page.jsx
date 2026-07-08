import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Scans() {
  noStore();
  const reports = await apiGet('/reports');

  return (
    <div className="stack">
      <Header eye="Scans & Reports" title="Review managed scan evidence" desc="Execution history, findings, report artifacts, and remediation context stay tied to managed machines.">
        <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>
      </Header>
      <Filters name="Scans & Reports" items={['Severity', 'Time range', 'Environment']} />
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
