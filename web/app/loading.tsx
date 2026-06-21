// Route-level loading UI: shown while the server component fetches filings.
// Mirrors the real layout (stat cards + table) so there's no layout shift.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading filings">
      <div className="stat-cards">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card" key={i}>
            <div className="skeleton-block sm" />
            <div className="skeleton-block lg" />
          </div>
        ))}
      </div>
      <div className="skeleton-table">
        {Array.from({ length: 12 }).map((_, i) => (
          <div className="skeleton-row" key={i} />
        ))}
      </div>
    </div>
  );
}
