import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Audit({ params }) {
  noStore();
  const { id } = await params;
  let audit;
  try {
    audit = await apiGet('/one-time-audits/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }

  const reports = await apiGet('/reports').catch(() => []);
  const auditReports = reports.filter((report) => (report.audit_id || report.auditId) === audit.id);

  return (
    <div className="stack">
      <Header
        eye="Historical one-time audit"
        title={audit.display_name || audit.hostname || 'Standalone audit'}
        desc="Read-only historical evidence from a standalone scanner run. New one-time audits are run locally from the GitHub scanner bundle."
      >
        <Link className="btn alt" href={routePath('/inventory/new')}>Promote to Managed Machine</Link>
      </Header>
      <section className="grid">
        <article className="panel">
          <h2>Audit details</h2>
          <p>Asset mode: one_time_audit</p>
          <p>Hostname: {audit.hostname || 'Not recorded'}</p>
          <p>IP address: {audit.ip_address || 'Not recorded'}</p>
          <p>Connection: {audit.connection_mode || 'Not recorded'}</p>
          <p>Status: {audit.status || 'unknown'}</p>
        </article>
        <article className="panel">
          <h2>Evidence posture</h2>
          <p>This record is retained for historical review and cannot be created or rerun from the app.</p>
          <Pill>{audit.status || 'unknown'}</Pill>
        </article>
      </section>
      <section className="panel">
        <h2>Audit reports</h2>
        {auditReports.length === 0 ? <p className="note">No retained reports are linked to this audit.</p> : auditReports.map((report) => (
          <Link className="row" href={routePath('/scans-reports/reports/' + report.id)} key={report.id}>
            <span><b>{report.title || 'Standalone audit report'}</b><small>{report.created_at}</small></span>
            <Pill>{report.status}</Pill>
          </Link>
        ))}
      </section>
    </div>
  );
}
