'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ComposedEmptyState, OperationsLedger, OperationsLedgerRow, OperationsSummaryStrip, OperationalSection, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

function readableStatus(status) {
  return String(status || 'unknown').replace(/_/g, ' ');
}

function formatDate(value) {
  if (!value) return 'Not scanned';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
}

export function InventoryRegistry({ machines }) {
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const environments = useMemo(() => [...new Set(machines.map((machine) => machine.env || 'Unassigned').filter(Boolean))].sort(), [machines]);
  const statuses = useMemo(() => [...new Set(machines.map((machine) => machine.status || 'unknown').filter(Boolean))].sort(), [machines]);
  const visibleMachines = useMemo(() => machines.filter((machine) => (
    (!environmentFilter || (machine.env || 'Unassigned') === environmentFilter)
    && (!statusFilter || (machine.status || 'unknown') === statusFilter)
  )), [environmentFilter, machines, statusFilter]);
  const openRemediation = visibleMachines.reduce((count, machine) => count + Number(machine.remediation_count || 0), 0);

  return (
    <>
      <OperationsSummaryStrip
        label="Managed machine registry summary"
        items={[
          { label: 'Enrolled', value: machines.length },
          { label: 'Visible', value: visibleMachines.length },
          { label: 'Open remediation', value: openRemediation },
          { label: 'Environments', value: environments.length },
          { label: 'SSH managed', value: machines.filter((machine) => machine.connection_mode !== 'pull_checkin').length },
          { label: 'Pull check-in', value: machines.filter((machine) => machine.connection_mode === 'pull_checkin').length },
        ]}
      />

      <OperationalSection id="machine-registry" eyebrow="Machine registry" title="Enrolled fleet" status={<Pill>{visibleMachines.length} shown</Pill>}>
        <form className="inventory-filters" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="inventory-environment-filter">
            Environment
            <select id="inventory-environment-filter" value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}>
              <option value="">All environments</option>
              {environments.map((environment) => <option key={environment} value={environment}>{environment}</option>)}
            </select>
          </label>
          <label htmlFor="inventory-status-filter">
            Status
            <select id="inventory-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{readableStatus(status)}</option>)}
            </select>
          </label>
          <button className="btn alt" type="button" onClick={() => { setEnvironmentFilter(''); setStatusFilter(''); }} disabled={!environmentFilter && !statusFilter}>Clear filters</button>
        </form>

        {visibleMachines.length ? (
          <OperationsLedger label="Filtered managed machines">
            {visibleMachines.map((machine) => (
              <OperationsLedgerRow key={machine.id}>
                <div className="operations-row-copy">
                  <b>{machine.name || machine.hostname || 'Managed machine'}</b>
                  <span>{machine.owner || 'Unassigned owner'} · {machine.env || 'Unassigned environment'} · Last scan {formatDate(machine.last_successful_scan_at)}</span>
                </div>
                <div className="operations-row-actions">
                  <Pill tone={Number(machine.remediation_count || 0) ? 'red' : 'green'}>{machine.remediation_count || 0} open remediation</Pill>
                  <Pill>{readableStatus(machine.status)}</Pill>
                  <Link href={routePath(`/inventory/machines/${machine.id}`)}>Open Machine</Link>
                </div>
              </OperationsLedgerRow>
            ))}
          </OperationsLedger>
        ) : (
          <ComposedEmptyState
            title={machines.length ? 'No machines match the selected filters' : 'No managed machines enrolled'}
            description={machines.length ? 'Clear one or both filters to return to the full fleet.' : 'Add a managed machine to begin tracking fleet health and scan history.'}
            actions={machines.length ? <button className="btn alt" type="button" onClick={() => { setEnvironmentFilter(''); setStatusFilter(''); }}>Clear filters</button> : <Link className="btn" href={routePath('/inventory/new')}>Add managed machine</Link>}
          />
        )}
      </OperationalSection>
    </>
  );
}