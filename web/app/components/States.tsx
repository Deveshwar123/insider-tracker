"use client";

// Shared loading and error states. Data is fetched in the browser now, so pages
// render these themselves rather than relying on route-level loading.tsx.

import { AlertTriangle } from "./icons";

export function TableSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading filings">
      <div className="skeleton-table">
        {Array.from({ length: rows }).map((_, i) => (
          <div className="skeleton-row" key={i} />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
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
      <TableSkeleton />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <div className="error-icon">
        <AlertTriangle size={32} />
      </div>
      <h2>Couldn’t load filings</h2>
      <p className="muted">{message}</p>
      {onRetry && (
        <button className="refresh-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
