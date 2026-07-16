import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { CompactPageHeader, ComposedEmptyState, OperationalSection, OperationsDisclosure, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, Pill } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { apiGet } from '@/lib/api-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function renderFinding(finding, index) {
  const summary = finding.summary || finding.title || `Finding ${index + 1}`;
  return (
    <OperationsDisclosure key={finding.id || `${index}-${summary}`} summary={`${summary} · ${finding.severity || 'informational'}`}><div className="operations-row-copy"><b>Finding evidence</b><span>{finding.status || 'open'}{finding.evidence ? ` · ${finding.evidence}` : ' · No additional evidence summary recorded.'}</span></div></OperationsDisclosure>
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
    <div className="operations-page report-dossier-page">
      <CompactPageHeader eyebrow="Evidence dossier" title={`${report.title} scan report`} description={`${report.source} report. Findings and scanner-generated artifacts remain tied to the scanned subject.`} status={<><Pill>{report.status}</Pill><Pill>{report.severity}</Pill></>} actions={<Link className="btn alt" href="/scans-reports">All reports</Link>} />
      <OperationsSummaryStrip items={[{ label: 'Environment', value: report.env }, { label: 'Findings', value: report.finding_count || 0 }, { label: 'Artifacts', value: artifacts.length }, { label: 'Status', value: report.status }]} />
      <OperationalSection id="artifacts" eyebrow="Downloads" title="Generated scanner artifacts" status={<Pill>{artifacts.length}</Pill>}>
        {artifacts.length === 0 ? <ComposedEmptyState title="No downloadable artifacts" description="This scan did not record downloadable scanner artifacts." /> : <OperationsLedger label="Generated scanner artifacts">{artifacts.map((artifact) => { const href = artifact.download_path ? `${apiBase}${artifact.download_path}` : null; return <OperationsLedgerRow key={artifact.id}><div className="operations-row-copy"><b>{artifactLabel(artifact.artifact_type)}</b><span>{artifactDescription(artifact)}</span></div><div className="operations-row-actions"><Pill>{artifact.artifact_type}</Pill>{href ? <a className="btn alt" href={href} target="_blank" rel="noreferrer">Open artifact</a> : <Pill>metadata only</Pill>}</div></OperationsLedgerRow>; })}</OperationsLedger>}
      </OperationalSection>
      <OperationalSection eyebrow="Finding evidence" title="Findings and remediation" status={<Pill>{findings.length}</Pill>}>
        {findings.length === 0 ? <ComposedEmptyState title="No findings recorded" description="This scan completed without findings." /> : <div className="compact-disclosure-stack">{findings.map(renderFinding)}</div>}
      </OperationalSection>
      <OperationalSection eyebrow="Related workflow" title="Compare and export"><OperationsDisclosure summary="Compare reports"><p>Compare evidence by opening another report from the report ledger.</p></OperationsDisclosure><OperationsDisclosure summary="Import and export"><p>Download the available scanner artifacts above for formal review, tooling, or evidence retention.</p></OperationsDisclosure></OperationalSection>
    </div>
  );
}
