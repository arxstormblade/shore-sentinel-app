'use client';

export default function ErrorState({ reset }) {
  return (
    <section className="route-state route-state-error" role="alert" aria-live="assertive">
      <p className="route-state-eyebrow">Unable to load this view</p>
      <h1>Shore Sentinel could not retrieve the requested data.</h1>
      <p>The failure details are withheld here to avoid exposing transport or sensitive service information. Retry the request, or contact an administrator if it continues.</p>
      <button className="btn" type="button" onClick={reset}>Retry</button>
    </section>
  );
}
