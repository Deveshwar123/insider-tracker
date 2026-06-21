"use client";

// Route-level error boundary: recover gracefully if a server fetch fails
// (Supabase/EDGAR hiccup) instead of showing a blank crash.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-state">
      <div className="error-icon">⚠</div>
      <h2>Couldn’t load filings</h2>
      <p className="muted">{error.message || "Something went wrong fetching data."}</p>
      <button className="refresh-retry" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
