import { Header, Filters } from '@/components/ui';
import { apiBase, remediations } from '@/lib/data';

export default function Remediation() {
  return (
    <div className="stack">
      <Header eye="Remediation" title="Cross-cutting finding workflow" desc="Live remediation items will appear after scans produce findings." />
      <Filters name="Remediation" items={['Severity', 'Time range', 'Environment']} />
      <p className="note">API list: {apiBase}/remediation</p>
      <section className="panel">
        {remediations.length ? null : <div className="empty"><h3>No remediation items yet</h3><p>Run a live scan to create findings and remediation work from scratch.</p></div>}
      </section>
    </div>
  );
}
