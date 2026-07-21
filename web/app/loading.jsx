export default function Loading() {
  return (
    <section className="route-state" aria-busy="true" aria-live="polite" aria-label="Loading page">
      <p className="route-state-eyebrow">Loading</p>
      <div className="route-state-skeleton route-state-skeleton-title" aria-hidden="true" />
      <div className="route-state-skeleton" aria-hidden="true" />
      <div className="route-state-skeleton route-state-skeleton-short" aria-hidden="true" />
      <span className="sr-only">Loading Shore Sentinel data…</span>
    </section>
  );
}
