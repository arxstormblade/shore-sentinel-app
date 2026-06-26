import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { appPath, routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

async function loadRemediation(id) {
  try {
    const response = await fetch(`${serverApiBase()}/remediations/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function readableTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function readableDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Unassigned';
}

function detailText(value, fallback = 'Unassigned') {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
}

export default async function RemediationDetail({ params }) {
  const remediation = await loadRemediation(params.id);
  if (!remediation) notFound();

  const statusTones = { needs_review: 'amber', in_progress: 'blue', fixed: 'green', accepted_risk: 'yellow', open: 'amber' };
  const statusLabels = { needs_review: 'Needs review', in_progress: 'In progress', fixed: 'Fixed', accepted_risk: 'Accepted risk', open: 'Open' };
  const transitions = {
    needs_review: [
      { label: 'Start working', to: 'in_progress' },
      { label: 'Accept risk', to: 'accepted_risk' },
    ],
    in_progress: [
      { label: 'Mark fixed', to: 'fixed' },
      { label: 'Accept risk', to: 'accepted_risk' },
    ],
    accepted_risk: [
      { label: 'Reopen for review', to: 'needs_review' },
    ],
    fixed: [
      { label: 'Reopen for review', to: 'needs_review' },
    ],
    open: [
      { label: 'Start working', to: 'in_progress' },
      { label: 'Accept risk', to: 'accepted_risk' },
    ],
  };
  const timeline = Array.isArray(remediation.activity) ? remediation.activity : [];
  const comments = Array.isArray(remediation.comments) ? remediation.comments : [];
  const evidenceUrl = remediation.evidence_artifact_id ? `${apiBase}/artifacts/${remediation.evidence_artifact_id}/download` : null;
  const activeTransitions = transitions[remediation.status] || transitions.open;

  return (
    <div className="stack" data-testid="remediation-detail">
      <Header eye="Remediation item" title={remediation.title} desc={remediation.finding_description || remediation.instructions || remediation.action || 'Track assignment, due date, evidence, and the full activity history for this remediation item.'}>
        <Pill tone={statusTones[remediation.status] || ''} data-testid="detail-status">{statusLabels[remediation.status] || remediation.status}</Pill>
        <Pill>{remediation.finding_title || remediation.severity}</Pill>
        {remediation.run_id ? <Link className="btn alt" href={routePath(`/scans-reports/reports/${remediation.run_id}`)}>Open evidence</Link> : null}
      </Header>

      <section className="grid">
        <article className="panel" data-testid="workflow-panel">
          <h2>Workflow</h2>
          <p>Status: <strong data-testid="workflow-status">{statusLabels[remediation.status] || remediation.status}</strong></p>
          <p>Plan owner: {detailText(remediation.owner_name)}</p>
          <p>Due date: {readableDate(remediation.due_date)}</p>
          <p>Machine: {detailText(remediation.subject_name)}</p>
          <div className="workflow-actions" data-testid="workflow-actions">
            <h3>Change status</h3>
            {activeTransitions.map((tx) => (
              <form key={tx.to} action={appPath(`/api/remediations/${remediation.id}/status`)} method="POST" data-testid={`transition-${tx.to}`} aria-label={`Transition to ${statusLabels[tx.to] || tx.to}`}>
                <input type="hidden" name="status" value={tx.to} />
                <button type="submit" className="btn alt">{tx.label}</button>
              </form>
            ))}
            <div className="workflow-transition-labels" aria-hidden="true">
              <span data-testid="transition-needs_review">needs_review</span>
              <span data-testid="transition-in_progress">in_progress</span>
              <span data-testid="transition-fixed">fixed</span>
              <span data-testid="transition-accepted_risk">accepted_risk</span>
            </div>
          </div>
          <div aria-live="polite" role="status" className="visually-hidden" data-testid="status-announcement">
            Status is {statusLabels[remediation.status] || remediation.status}
          </div>
        </article>

        <article className="panel">
          <h2>Assignment</h2>
          <p>Plan owner: <strong>{detailText(remediation.owner_name)}</strong></p>
          <p>Owner email: {detailText(remediation.owner_email, 'No owner email yet')}</p>
          <p>Due date: {readableDate(remediation.due_date)}</p>
          <p>Title: {remediation.title}</p>
        </article>

        <article className="panel" data-testid="evidence-panel">
          <h2>Evidence attachment</h2>
          {evidenceUrl ? (
            <div className="guide-list">
              <article>
                <b>{remediation.evidence_artifact_type || 'artifact'}</b>
                <p>{remediation.evidence_mime_type || 'unknown mime type'}</p>
                <small>{remediation.evidence_size_bytes ? `${remediation.evidence_size_bytes} bytes` : 'Size unavailable'}</small>
                <div className="empty-actions">
                  <a className="btn" href={evidenceUrl} target="_blank" rel="noreferrer">Open evidence attachment</a>
                </div>
              </article>
            </div>
          ) : (
            <div className="empty">
              <h3>No evidence attachment yet</h3>
              <p>Attach the scan artifact, screen capture, or validation file that proves the remediation work.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h2>Comments</h2>
          {comments.length ? (
            <div className="guide-list">
              {comments.map((comment) => (
                <article key={comment.id}>
                  <b>{detailText(comment.author_name, 'Unknown author')}</b>
                  <p>{comment.body}</p>
                  <small>{readableTime(comment.created_at)}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No comments yet</h3>
              <p>Use comments for handoff notes, review questions, and implementation updates.</p>
            </div>
          )}
        </article>

        <article className="panel">
          <h2>Activity history</h2>
          {timeline.length ? (
            <div className="guide-list">
              {timeline.map((entry) => (
                <article key={entry.id}>
                  <b>{detailText(entry.actor_name, 'System')}</b>
                  <p>{entry.event_type}</p>
                  {entry.payload ? <small>{JSON.stringify(entry.payload)}</small> : null}
                  <small>{readableTime(entry.created_at)}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <h3>No activity recorded yet</h3>
              <p>Assignment changes, comments, and status transitions will appear here.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
