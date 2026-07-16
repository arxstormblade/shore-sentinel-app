import { isTerminalRun } from './machine-run-status.js';

const OPEN_REMEDIATION_STATUSES = new Set(['open', 'accepted']);

function array(value) {
  return Array.isArray(value) ? value : [];
}

export function selectInitialRuns(runsPayload, fallbackReports) {
  return Array.isArray(runsPayload?.runs) ? runsPayload.runs : array(fallbackReports);
}

export function openRemediationItems(items) {
  return array(items).filter((item) => OPEN_REMEDIATION_STATUSES.has(String(item?.status || 'open').toLowerCase()));
}

export function openRemediationCount(serverCount, items) {
  if (serverCount !== null && serverCount !== undefined && Number.isFinite(Number(serverCount))) {
    return Math.max(0, Number(serverCount));
  }
  return openRemediationItems(items).length;
}

export function scanLaunchBlocked(runs, runHistoryUnavailable = false) {
  return Boolean(runHistoryUnavailable) || array(runs).some((run) => !isTerminalRun(run));
}
