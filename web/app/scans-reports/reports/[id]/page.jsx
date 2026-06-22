import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header, Pill } from '@/components/ui';
import { apiBase } from '@/lib/data';
import { routePath } from '@/lib/paths';

const serverApiBase = () => (process.env.INTERNAL_API_URL || process.env.API_URL || 'http://api:4000').replace(/\/$/, '');

export const dynamic = 'force-dynamic';

export function generateStaticParams() { return []; }

async function loadRun(id) {
  try {
    const response = await fetch(`${serverApiBase()}/scan-runs/${id}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function loadRunArtifacts(id) {
  try {
    const response = await fetch(`${serverApiBase()}/scan-runs/${id}/artifacts`, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.artifacts ?? [];
  } catch {
    return [];
  }
}

async function loadRunEvents(id) {
  try {
    const response = await fetch(`${serverApiBase()}/scan-runs/${id}/events`, { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json();
    return payload.events ?? [];
  } catch {
    return [];
  }
}

function readableTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

export default async function Report({ params }) {
  const [run, artifacts, events] = await Promise.all([loadRun(params.id), loadRunArtifacts(params.id), loadRunEvents(params.id)]);
  if (!run) notFound();

  return (
    <div className="stack">
      <Header
        eye="Scan report"
        title={`Report ${run.id}`}
        desc={`Status: ${run.status} · Completed: ${readableTime(run.completed_at || run.updated_at || run.created_at)}`}
      >
        {run.target_id ? <Link className="btn alt" href={routePath(`/inventory/machines/${run.target_id}`)}>Back to machine</Link> : null}
        <Link className="btn" href={routePath('/scans-reports')}>All reports</Link>
      </Header>

      <section className="grid">
        <article className="panel">
          <h2>Run summary</h2>
          <p>Subject type: {run.subject_type}</p>
          <p>Target: {run.target_id ?? '—'}</p>
          <p>Started: {readableTime(run.started_at || run.created_at)}</p>
          <p>Finished: {readableTime(run.completed_at)}</p>
        </article>
        <article className="panel">
          <h2>Posture</h2>
          <b className="score">{typeof run.latest_progress_percent === 'number' ? `${run.latest_progress_percent}%` : run.status}</b>
          <Pill tone={run.status === 'succeeded' ? 'green' : 'amber'}>{run.status}</Pill>
        </article>
      </section>

      <section className="panel">
        <h2>Artifacts</h2>
        {artifacts.length ? (
          <div className="cards report-cards">
            {artifacts.map((artifact) => (
              <article className="card report-card" key={artifact.id}>
                <h3>{artifact.artifact_type}</h3>
                <p>{artifact.mime_type ?? 'unknown mime type'}</p>
                <p>{artifact.size_bytes} bytes</p>
                <a className="btn" href={`${apiBase}/artifacts/${artifact.id}/download`} target="_blank" rel="noreferrer">
                  {artifact.artifact_type === 'pdf' ? 'Open PDF report' : 'Open artifact'}
                </a>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty"><p>No artifacts were recorded for this report.</p></div>
        )}
      </section>

      <section className="panel">
        <h2>Timeline</h2>
        <div className="guide-list">
          {events.length ? events.map((event) => (
            <article key={event.id}>
              <b>{event.event_type}</b>
              <p>{event.message}</p>
              <small>{readableTime(event.created_at)}</small>
            </article>
          )) : <div className="empty"><p>No timeline events were recorded for this run.</p></div>}
        </div>
      </section>
    </div>
  );
}
