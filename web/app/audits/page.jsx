import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { Header, Filters, Pill, Empty } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Audits() {
  noStore();
  const audits = await apiGet('/one-time-audits');

  return (
    <div className="stack">
      <Header eye="Audit History" title="One-time audits stay outside fleet health" desc="Use this view for ad hoc validation, evidence, and temporary target reviews.">
        <Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <Filters name="Audit history" items={['Severity', 'Time range', 'Environment']} />
      <p className="note">API list: {apiBase}/one-time-audits</p>
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
