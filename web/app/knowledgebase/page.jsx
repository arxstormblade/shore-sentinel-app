import Link from 'next/link';
import { CompactPageHeader, OperationalSection, OperationsDisclosure, OperationsLedger, OperationsLedgerRow, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

export default function KB() {
  return (
    <div className="operations-page knowledgebase-page">
      <CompactPageHeader
        eyebrow="Operational reference"
        title="Knowledgebase"
        description="Use this guide to operate managed-machine monitoring and interpret scan evidence."
        status={<Pill>managed monitoring first</Pill>}
      />

      <OperationalSection id="managed-machine-monitoring" eyebrow="Monitoring" title="Managed machine monitoring"><p><b>Managed machines</b> are endpoints Shore Sentinel monitors over time. Use them for recurring scan history, stale-machine visibility, remediation ownership, and fleet-level reporting.</p><OperationsLedger label="Monitoring choices"><OperationsLedgerRow><div className="operations-row-copy"><b>Use managed machines when…</b><span>The endpoint needs recurring monitoring, scan history, dashboard trends, or remediation tracking.</span></div><Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link></OperationsLedgerRow><OperationsLedgerRow><div className="operations-row-copy"><b>Use reports when…</b><span>You need generated evidence, findings, artifacts, and remediation in one place.</span></div><Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link></OperationsLedgerRow></OperationsLedger></OperationalSection>

      <OperationalSection id="managed-check-in" eyebrow="Connectivity" title="How managed machines check in"><OperationsDisclosure summary="Approved check-in flows"><p>Managed machines use approved pull-agent or SSH-push flows and feed fleet health views. Their scan runs, findings, artifacts, and remediation records stay tied to a managed inventory record.</p></OperationsDisclosure></OperationalSection>

      <OperationalSection id="remediation" eyebrow="Triage" title="Reading remediation severity and evidence"><OperationsDisclosure summary="Evidence-first remediation"><p>Severity colors support triage while operational panels stay solid and high contrast. Managed-machine remediation should be reviewed by owner, due date, business impact, and evidence artifact.</p></OperationsDisclosure></OperationalSection>
    </div>
  );
}
