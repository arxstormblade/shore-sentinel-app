const SUCCESS_STATUSES = new Set(['succeeded', 'completed']);
const TERMINAL_STATUSES = new Set(['succeeded', 'completed', 'failed', 'cancelled', 'stale']);
const TERMINAL_EVENTS = new Set(['job.succeeded', 'job.failed', 'job.cancelled', 'job.stale']);
const STATUS_PROGRESS = {
  queued: 0,
  pending: 0,
  claimed: 10,
  leased: 10,
  running: 25,
  parsing: 55,
  artifact_uploading: 80,
  retrying: 90,
};

function normalizedStatus(run) {
  return String(run?.status || '').toLowerCase();
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(100, Math.max(0, number));
}

export function isSuccessfulRun(run) {
  return SUCCESS_STATUSES.has(normalizedStatus(run)) || run?.latest_event_type === 'job.succeeded';
}

export function isTerminalRun(run) {
  return TERMINAL_STATUSES.has(normalizedStatus(run)) || TERMINAL_EVENTS.has(run?.latest_event_type);
}

export function progressForRun(run) {
  if (!run) return 0;
  const reported = clampProgress(run.latest_progress_percent ?? run.progress_percent);
  if (reported != null) return reported;
  if (isSuccessfulRun(run)) return 100;
  return STATUS_PROGRESS[normalizedStatus(run)] ?? 0;
}

export function toneForRun(run) {
  if (isSuccessfulRun(run)) return 'green';
  if (normalizedStatus(run) === 'failed' || run?.latest_event_type === 'job.failed') return 'red';
  return 'amber';
}
