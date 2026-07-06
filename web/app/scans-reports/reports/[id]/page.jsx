import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function renderFinding(finding, index) {
  const summary = finding.summary || finding.title || `Finding ${index + 1}`;
  return (
    <li key={finding.id || `${index}-${summary}`} className="finding-summary-row">
      <span>
        <b>{summary}</b>
        <small>{finding.severity || 'informational'} · {finding.status || 'open'}</small>
        {finding.evidence ? <small>{finding.evidence}</small> : null}
      </span>
    </li>
  );
}

function artifactLabel(type) {
  return ({
    pdf: 'PDF report',
    markdown: 'Markdown report',
    sarif: 'SARIF results',
    'scanner.raw_output': 'Raw scanner JSON',
    'scanner.normalized_findings': 'Normalized findings JSON',
    'scanner.enrichment_summary': 'CVE enrichment summary',
  })[type] || type;
}

function artifactDescription(artifact) {
  const kb = Math.max(1, Math.round(Number(artifact.size_bytes || 0) / 1024));
  return `${artifact.mime_type || 'artifact'} · ${kb} KB · ${artifact.parse_status}`;
}

export default async function Report({ params }) {
  noStore();
  const { id } = await params;
  let report;
  try {
    report = await apiGet('/reports/' + id);
  } catch (error) {
    if (String(error.message || error).includes('400')) notFound();
    throw error;
  }
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];

  return (
    <div className="stack">
      <Header eye="Report" title={`${report.title} scan report`} desc={`${report.source} report. Evidence, findings, and scanner-generated artifacts stay tied to the scanned subject.`}>
        <details>
          <summary>Actions</summary>
          <a href="#artifacts">Open artifacts</a>
          <a href="#compare">Compare reports</a>
          <a href="#export">Import / export</a>
        </details>
      </Header>

      <section className="grid">
        <article className="panel">
          <h2>Report summary</h2>
          <p>Environment: {report.env}</p>
          <p>Findings: {report.finding_count || 0}</p>
          <p>Artifacts: {artifacts.length}</p>
          <Pill>{report.status}</Pill>
          <Pill>{report.severity}</Pill>
        </article>
        <article className="panel">
          <h2>Progress</h2>
          <p className="ok">{report.status}</p>
          <p>Started: {report.created_at}</p>
          {report.completed_at ? <p>Completed: {report.completed_at}</p> : null}
        </article>
      </section>

      <section id="artifacts" className="panel">
        <h2>Generated scanner artifacts</h2>
        <p className="note">Open the PDF report for review, Markdown for text evidence, SARIF for tooling, and normalized JSON for CVE-enriched findings.</p>
        {artifacts.length === 0 ? (
          <p className="note">No downloadable scanner artifacts were recorded for this run.</p>
        ) : (
          <div className="artifact-list">
            {artifacts.map((artifact) => {
              const href = artifact.download_path ? `${apiBase}${artifact.download_path}` : null;
              return (
                <article className="row" key={artifact.id}>
                  <span>
                    <b>{artifactLabel(artifact.artifact_type)}</b>
                    <small>{artifactDescription(artifact)}</small>
                  </span>
                  <Pill>{artifact.artifact_type}</Pill>
                  {href ? <a className="btn alt" href={href} target="_blank" rel="noreferrer">Open artifact</a> : <Pill>metadata only</Pill>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Findings and remediation</h2>
        <p className="note">When scanner findings include vulnerability references, Shore Sentinel keeps evidence and remediation connected to the report.</p>
        {findings.length === 0 ? <p className="note">No findings were recorded for this scan run.</p> : <ul className="finding-summary-list">{findings.map(renderFinding)}</ul>}
      </section>

      <section id="compare" className="panel soft">
        <h2>Compare reports</h2>
        <p>Side-by-side report comparison lives here so the primary toolbar can stay lean.</p>
      </section>

      <section id="export" className="panel soft">
        <h2>Import / export</h2>
        <p>Exporting report evidence and importing reference data live here as secondary actions.</p>
      </section>
    </div>
  );
}
