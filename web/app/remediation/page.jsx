import Link from 'next/link';
import { Header, Filters, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');
const severityTone = { critical: 'red', high: 'red', medium: 'amber', low: 'yellow', informational: 'blue' };

async function loadFindings() {
  try {
    const response = await fetch(`${serverApiBase()}/findings`, { cache: 'no-store' });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

function readableText(value, fallback = '') {
  if (typeof value === 'string') return value === '[object Object]' ? fallback : value;
  if (value == null) return fallback;
  if (Array.isArray(value)) return value.map((item) => readableText(item)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const primary = value.instruction || value.action || value.recommendation || value.remediation || value.description || value.summary || value.title;
    const parts = [readableText(primary, fallback)];
    if (value.file_path) parts.push(`File: ${value.file_path}`);
    if (value.command) parts.push(`Command: ${value.command}`);
    return parts.filter(Boolean).join('\n') || fallback;
  }
  return String(value);
}

function remediationText(finding) {
  return readableText(
    finding.remediation_action || finding.remediation_instructions || finding.remediation_title,
    'Review evidence, apply the recommended hardening step, then rerun the scan.',
  );
}

export default async function Remediation() {
  const findings = await loadFindings();
  return (
    <div className="stack">
      <Header eye="Remediation" title="Actionable findings" desc="Turn scanner findings into clear remediation work. Each row explains the risk, affected subject, and suggested next action." />
      <Filters name="Remediation" items={['Severity', 'Status', 'Environment', 'Owner']} />
      <section className="panel">
        <header><div><h2>Open remediation queue</h2><p>Create remediation tasks from scanner recommendations or review suggested remediation directly from the scan evidence.</p></div><Pill>{findings.length} findings</Pill></header>
        {findings.length ? (
          <div className="finding-list">
            {findings.map((finding) => (
              <article className="finding-row" key={finding.id}>
                <div>
                  <p className="eye">{finding.subject_name}</p>
                  <h3>{finding.title}</h3>
                  <p>{finding.description || finding.evidence_summary || 'Scanner evidence is available in the report artifacts.'}</p>
                  <small>Suggested remediation: {remediationText(finding)}</small>
                </div>
                <aside>
                  <Pill tone={severityTone[finding.severity] || ''}>{finding.severity}</Pill>
                  <Pill>{finding.remediation_status || finding.status || 'open'}</Pill>
                  <Link className="btn alt" href={routePath(`/scans-reports/reports/${finding.run_id}`)}>Open evidence</Link>
                </aside>
              </article>
            ))}
          </div>
        ) : <div className="empty"><h3>No actionable findings yet</h3><p>Run a live scan to create findings. If findings exist but remediation records are not created, this page will still show Suggested remediation from scanner evidence.</p><Link className="btn" href={routePath('/scans-reports')}>Review scans</Link></div>}
      </section>
    </div>
  );
}
