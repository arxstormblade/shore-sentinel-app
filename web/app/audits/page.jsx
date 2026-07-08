import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Audits() {
  noStore();
  const audits = await apiGet('/one-time-audits');

  return (
    <div className="stack">
      <Header eye="Historical evidence" title="Standalone records stay outside fleet health" desc="Use this read-only view for legacy evidence and temporary target reviews. New local scanner runs are distributed from GitHub, not created in the app." />
      <Filters name="Audit history" items={['Severity', 'Time range', 'Environment']} />
      {audits.length === 0 ? (
        <Empty />
      ) : (
        <section className="panel">
          {audits.map((a) => (
            <Link className="row" href={routePath('/audits/' + a.id)} key={a.id}>
              <span>
                <b>{a.target || a.display_name}</b>
                <small>{a.hostname || a.ip_address || 'Temporary audit target'} · {a.connection_mode}</small>
              </span>
              <span>{a.promote}</span>
              <Pill>{a.status}</Pill>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
