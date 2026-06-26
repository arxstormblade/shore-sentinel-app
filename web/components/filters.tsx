'use client';

import { useSearchParams } from 'next/navigation';

const filterOptions = {
  Environment: ['All environments', 'Production', 'Lab', 'Unassigned'],
  Status: ['All statuses', 'Online', 'Offline', 'Unknown', 'Running', 'Completed', 'Failed', 'Needs review', 'In progress', 'Fixed', 'Accepted risk'],
  Severity: ['All severities', 'Critical', 'High', 'Medium', 'Low', 'Informational'],
  'Time range': ['Any time', 'Last 24 hours', 'Last 7 days', 'Last 30 days'],
  Platform: ['All platforms', 'Windows', 'Linux', 'macOS'],
  Owner: ['All owners', 'Unassigned', 'IT', 'Security'],
};

export function Filters({ name, items }) {
  const searchParams = useSearchParams();

  function setValue(filterName, value) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.startsWith('All ') || value === 'Any time') {
      params.delete(filterName);
    } else {
      params.set(filterName, value);
    }
    return params.toString();
  }

  return (
    <section className="filters" aria-label={`${name} filters`}>
      <b>{name} filters</b>
      {items.map((filterName) => {
        const options = filterOptions[filterName] || [`All ${filterName.toLowerCase()}`];
        const current = searchParams.get(filterName) || options[0];
        return (
          <label key={filterName}>
            <span>{filterName}</span>
            <select
              aria-label={`${name} ${filterName} filter`}
              value={current}
              onChange={(e) => {
                const next = setValue(filterName, e.target.value);
                window.location.search = next;
              }}
            >
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        );
      })}
      <small className="filter-hint" role="status" aria-live="polite">Filters are scoped to this view so each choice matches the data below.</small>
    </section>
  );
}
