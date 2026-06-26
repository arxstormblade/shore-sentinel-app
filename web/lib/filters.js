const ENV_VALUES = new Set(['Production', 'Lab', 'Unassigned']);
const STATUS_VALUES = new Set(['Online', 'Offline', 'Unknown']);
const severity_LEVELS = ['critical', 'high', 'medium', 'low', 'informational'];
const RUN_STATUS_VALUES = new Set(['completed', 'running', 'leased', 'pending']);
const RUN_STATUS_LABELS = {
  completed: 'Completed',
  running: 'Running',
  leased: 'Running',
  pending: 'Pending',
};

function parseTimeRangeParam(timeRange) {
  if (!timeRange || timeRange === 'Any time') return null;
  if (timeRange === 'Last 24 hours') return { hours: 24 };
  if (timeRange === 'Last 7 days') return { hours: 24 * 7 };
  if (timeRange === 'Last 30 days') return { hours: 24 * 30 };
  return null;
}

function normalizeSeverity(value, fallback = 'informational') {
  const v = String(value || '').toLowerCase();
  return SEVERITY_LEVELS.includes(v) ? v : fallback;
}

export function filterTargets(targets, { env, status, platform } = {}) {
  return targets.filter((target) => {
    if (env && env !== 'All environments' && (target.env || 'Unassigned') !== env) return false;
    const targetStatus = target.status === 'unknown' ? 'Online' : target.status;
    if (status && status !== 'All statuses' && String(targetStatus) !== status) return false;
    if (platform && platform !== 'All platforms' && (target.platform || 'Unspecified') !== platform) return false;
    return true;
  });
}

export function filterAudits(audits, { severity = 'All severities', timeRange = 'Any time', env = 'All environments' } = {}) {
  const cutoff = parseTimeRangeParam(timeRange);
  const severityLevel = normalizeSeverity(severity);
  const severityOrder = SEVERITY_LEVELS.indexOf(severityLevel);

  return audits.filter((audit) => {
    if (env && env !== 'All environments' && (audit.env || 'Unassigned') !== env) return false;
    if (severity && severity !== 'All severities') {
      const auditSeverity = normalizeSeverity(audit.severity);
      if (auditSeverity !== severityLevel) return false;
    }
    if (cutoff) {
      const ref = new Date(audit.updated_at || audit.created_at || 0).getTime();
      if (ref < Date.now() - cutoff.hours * 60 * 60 * 1000) return false;
    }
    return true;
  });
}

export function filterRuns(runs, { runStatus, severity, env, timeRange } = {}) {
  const cutoff = parseTimeRangeParam(timeRange);
  const normalizedSeverity = severity && severity !== 'All severities' ? normalizeSeverity(severity) : null;

  return runs.filter((run) => {
    if (runStatus && runStatus !== 'All statuses' && String(run.status) !== runStatus) return false;
    if (env && env !== 'All environments' && (run.environment || run.env || 'Unassigned') !== env) return false;
    if (normalizedSeverity) {
      const runMax = normalizeSeverity(run.highest_severity || run.severity);
      if (SEVERITY_LEVELS.indexOf(runMax) > SEVERITY_LEVELS.indexOf(normalizedSeverity)) return false;
    }
    if (cutoff) {
      const ref = new Date(run.completed_at || run.created_at || 0).getTime();
      if (ref < Date.now() - cutoff.hours * 60 * 60 * 1000) return false;
    }
    return true;
  });
}

export function summarizeRuns(runs, counts) {
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  const statusCounts = { completed: 0, running: 0, leased: 0, pending: 0 };
  for (const run of runs) {
    const sev = normalizeSeverity(run.highest_severity || run.severity);
    severityCounts[sev] = (severityCounts[sev] || 0) + 1;
    const st = String(run.status);
    if (st in statusCounts) statusCounts[st] += 1;
  }

  let summary;
  if (!counts || counts.active === 0) {
    summary = runs.length === 0 ? 'No scans yet' : `No scans match filters`;
  } else {
    const parts = [];
    if (counts.critical) parts.push(`${counts.critical} critical`);
    if (counts.high) parts.push(`${counts.high} high`);
    if (counts.medium) parts.push(`${counts.medium} medium`);
    if (counts.low) parts.push(`${counts.low} low`);
    summary = parts.length ? parts.join(', ') : `all ${runs.length} within range`;
  }

  return { severityCounts, statusCounts, summary };
}

export function filterFindings(findings, { severity = 'All severities', status = 'All statuses', env = 'All environments', owner = 'All owners' } = {}) {
  const normalizedSeverity = normalizeSeverity(severity);

  return findings.filter((finding) => {
    if (severity && severity !== 'All severities') {
      const findingSeverity = normalizeSeverity(finding.severity);
      if (findingSeverity !== normalizedSeverity) return false;
    }
    if (status && status !== 'All statuses') {
      const findingStatus = finding.remediation_status || 'open';
      if (String(findingStatus) !== status) return false;
    }
    if (env && env !== 'All environments' && (finding.environment || finding.env || 'Unassigned') !== env) return false;
    if (owner && owner !== 'All owners' && (finding.owner || finding.team || 'Unassigned') !== owner) return false;
    return true;
  });
}

export const FINDING_STATUS_VALUES = ['open', 'needs_review', 'in_progress', 'fixed', 'accepted_risk'];

export const FILTER_DEFAULTS = {
  'All environments': 'All environments',
  'All statuses': 'All statuses',
  'All platforms': 'All platforms',
  'All severities': 'All severities',
  'Any time': 'Any time',
  'All owners': 'All owners',
};
