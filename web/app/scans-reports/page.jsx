import Link from 'next/link';
import { Header, Filters } from '@/components/ui';
import { apiBase, reports } from '@/lib/data';
import { routePath } from '@/lib/paths';

export default function Scans() {
  return (
    <div className="stack">
      <Header eye="Scans & Reports" title="Run scans, follow progress, review reports" desc="Live scan runs and generated reports will appear here.">
        <Link id="audit-entry" className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link>
      </Header>
      <Filters name="Scans & Reports" items={['Severity', 'Time range', 'Environment']} />
      <p className="note">API list: {apiBase}/reports</p>
      <section className="panel">
        {reports.length ? null : <div className="empty"><h3>No reports yet</h3><p>Run a live audit or managed-machine scan to generate reports.</p><Link className="btn" href={routePath('/audits/new')}>Run One-Time Audit</Link></div>}
      </section>
    </div>
  );
}
