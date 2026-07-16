'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { OperationsDisclosure, OperationsLedger, OperationsLedgerRow, Pill } from '@/components/ui';
import { routePath } from '@/lib/paths';

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function titleCase(value) {
  return String(value || 'unknown').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function groupByMachine(items) {
  const groups = new Map();
  for (const item of items) {
    const machine = item.asset || 'Unassigned machine';
    const group = groups.get(machine) || { machine, env: item.env || 'Unassigned', owner: item.owner || 'Unassigned owner', findings: [] };
    group.findings.push(item);
    groups.set(machine, group);
  }
  return [...groups.values()].sort((a, b) => a.machine.localeCompare(b.machine));
}

function valuesFor(items, key) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
}

export function RemediationQueue({ items = [] }) {
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const severities = useMemo(() => valuesFor(items, 'severity'), [items]);
  const statuses = useMemo(() => valuesFor(items, 'status'), [items]);
  const environments = useMemo(() => valuesFor(items, 'env'), [items]);
  const filteredItems = useMemo(() => items.filter((item) => (
    (!severityFilter || normalized(item.severity) === normalized(severityFilter))
    && (!statusFilter || normalized(item.status) === normalized(statusFilter))
    && (!environmentFilter || item.env === environmentFilter)
  )), [items, severityFilter, statusFilter, environmentFilter]);
  const visibleGroups = useMemo(() => groupByMachine(filteredItems), [filteredItems]);

  function clearFilters() {
    setSeverityFilter('');
    setStatusFilter('');
    setEnvironmentFilter('');
  }

  return (
    <>
      <section className="compact-filter-bar" aria-label="Remediation filters">
        <label htmlFor="remediation-severity-filter">Severity<select id="remediation-severity-filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">All severities</option>{severities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label htmlFor="remediation-status-filter">Status<select id="remediation-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label htmlFor="remediation-environment-filter">Environment<select id="remediation-environment-filter" value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}><option value="">All environments</option>{environments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {(severityFilter || statusFilter || environmentFilter) ? <button className="btn ghost" type="button" onClick={clearFilters}>Clear filters</button> : null}
      </section>
      {visibleGroups.length === 0 ? <p className="compact-empty-note">No remediation items match the selected filters.</p> : (
        <OperationsLedger label="Remediation queue by machine">
          {visibleGroups.map((group) => (
            <OperationsLedgerRow key={group.machine}>
              <div className="operations-row-copy"><b>{group.machine}</b><span>{group.env} · {group.owner} · {group.findings.length} item{group.findings.length === 1 ? '' : 's'}</span></div>
              <OperationsDisclosure summary="Review remediation items"><div className="compact-disclosure-stack">{group.findings.map((item) => <article className="compact-finding-row" key={item.id}><div><b>{item.title || item.finding_title}</b><span>{item.guidance || item.action || item.evidence_summary || 'Review scanner evidence and apply the recommended remediation.'}</span></div><div className="operations-row-actions"><Pill>{titleCase(item.severity)}</Pill><Pill>{titleCase(item.status)}</Pill><Link className="btn alt" href={routePath(`/remediation/${item.id}`)}>View evidence</Link></div></article>)}</div></OperationsDisclosure>
            </OperationsLedgerRow>
          ))}
        </OperationsLedger>
      )}
    </>
  );
}
