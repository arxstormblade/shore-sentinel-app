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

function optionsFor(reports, key) {
  return [...new Set(reports.map((report) => report[key]).filter(Boolean))].sort();
}

export function ReportsLedger({ reports = [] }) {
  const [severityFilter, setSeverityFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const severities = useMemo(() => optionsFor(reports, 'severity'), [reports]);
  const environments = useMemo(() => optionsFor(reports, 'env'), [reports]);
  const statuses = useMemo(() => optionsFor(reports, 'status'), [reports]);
  const visibleReports = useMemo(() => reports.filter((report) => (
    (!severityFilter || normalized(report.severity) === normalized(severityFilter))
    && (!environmentFilter || report.env === environmentFilter)
    && (!statusFilter || normalized(report.status) === normalized(statusFilter))
  )), [reports, severityFilter, environmentFilter, statusFilter]);

  function clearFilters() {
    setSeverityFilter('');
    setEnvironmentFilter('');
    setStatusFilter('');
  }

  return (
    <>
      <section className="compact-filter-bar" aria-label="Scan report filters">
        <label htmlFor="report-severity-filter">Severity<select id="report-severity-filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="">All severities</option>{severities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        <label htmlFor="report-environment-filter">Environment<select id="report-environment-filter" value={environmentFilter} onChange={(event) => setEnvironmentFilter(event.target.value)}><option value="">All environments</option>{environments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label htmlFor="report-status-filter">Status<select id="report-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label>
        {(severityFilter || environmentFilter || statusFilter) ? <button className="btn ghost" type="button" onClick={clearFilters}>Clear filters</button> : null}
      </section>
      {visibleReports.length === 0 ? <p className="compact-empty-note">No reports match the selected filters.</p> : (
        <OperationsLedger label="Filtered scan reports">
          {visibleReports.map((report) => {
            const findings = Array.isArray(report.findings) ? report.findings : [];
            return (
              <OperationsLedgerRow key={report.id}>
                <div className="operations-row-copy">
                  <b>{report.title} scan report</b>
                  <span>{report.source} · {report.env} · {report.finding_count || 0} findings</span>
                  {findings.length ? <OperationsDisclosure summary={`${findings.length} finding${findings.length === 1 ? '' : 's'} available`}><ul className="compact-finding-list">{findings.map((finding, index) => <li key={finding.id || `${report.id}-${index}`}><b>{finding.summary || `Finding ${index + 1}`}</b><span>{titleCase(finding.severity || 'informational')} · {titleCase(finding.status || 'open')}{finding.evidence ? ` · ${finding.evidence}` : ''}</span></li>)}</ul></OperationsDisclosure> : null}
                </div>
                <div className="operations-row-actions"><Pill>{titleCase(report.status)}</Pill><Pill>{titleCase(report.severity)}</Pill><Link className="btn alt" href={routePath(`/scans-reports/reports/${report.id}`)}>Open report</Link></div>
              </OperationsLedgerRow>
            );
          })}
        </OperationsLedger>
      )}
    </>
  );
}
