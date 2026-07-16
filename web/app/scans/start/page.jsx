import Link from 'next/link';
import { CompactPageHeader, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, OperationalSection, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

export default function StartScan() {
  return (
    <div className="operations-page scan-start-page">
      <CompactPageHeader
        eyebrow="Monitoring command center"
        title="Start managed monitoring"
        description="Enroll a machine first, then keep scan evidence, remediation ownership, and fleet posture in one operational flow."
        actions={<><Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link><Link className="btn alt" href={routePath('/scans-reports')}>View reports</Link></>}
      />
      <OperationsSummaryStrip items={[{ label: 'Step 1', value: 'Enroll' }, { label: 'Step 2', value: 'Run or schedule' }, { label: 'Step 3', value: 'Review evidence' }, { label: 'Step 4', value: 'Resolve findings' }, { label: 'Workflow', value: 'Managed machines' }, { label: 'Standalone scans', value: 'GitHub only' }]} />
      <OperationalSection id="managed-monitoring-workflow" eyebrow="Primary workflow" title="Managed machine monitoring" status={<Pill tone="green">Recommended app workflow</Pill>}>
        <OperationsLedger label="Managed machine monitoring workflow">
          <OperationsLedgerRow><div className="operations-row-copy"><b>1. Enroll the endpoint</b><span>Create the managed machine record and approved connection profile.</span></div><Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link></OperationsLedgerRow>
          <OperationsLedgerRow><div className="operations-row-copy"><b>2. Run or schedule scans</b><span>Keep generated activity tied to the enrolled machine and its history.</span></div><Link href={routePath('/inventory')}>View inventory</Link></OperationsLedgerRow>
          <OperationsLedgerRow><div className="operations-row-copy"><b>3. Review evidence and remediation</b><span>Use reports for artifacts, findings, and remediation ownership.</span></div><Link href={routePath('/scans-reports')}>View reports</Link></OperationsLedgerRow>
        </OperationsLedger>
      </OperationalSection>
      <OperationalSection id="scan-guidance" eyebrow="Workflow guidance" title="Choose the right path">
        <p className="note">Use the app for machines that require ongoing visibility. Standalone scanner runs remain a GitHub README distribution path and do not create application records by default.</p>
        <Link className="btn alt" href={routePath('/knowledgebase#managed-machine-monitoring')}>Read the monitoring guide</Link>
      </OperationalSection>
    </div>
  );
}