"use client";

// The dashboard. Queries run in the browser using whatever credentials the
// reader configured, so this is a client component rather than a server one.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SearchBar from "./SearchBar";
import FilingsExplorer from "./FilingsExplorer";
import StatCards from "./StatCards";
import ClusterBuys from "./ClusterBuys";
import SetupGuide from "./SetupGuide";
import { DashboardSkeleton, ErrorState } from "./States";
import { getLatestFilings, searchFilings } from "@/lib/queries";
import { summarize } from "@/lib/summary";
import { computeStats, computeClusterBuys } from "@/lib/stats";
import { useAsync } from "@/lib/useAsync";
import { isConfigured } from "@/lib/supabase";

// Re-check the database on an interval so an open tab picks up filings the
// worker ingests through the day.
const REFRESH_MS = 60_000;

export default function Dashboard() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  // localStorage is browser-only, so the answer isn't known until after mount.
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => setConfigured(isConfigured()), []);

  const { data, error, loading, reload } = useAsync(
    () => (configured ? (q ? searchFilings(q) : getLatestFilings(500)) : Promise.resolve([])),
    [q, configured]
  );

  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  useEffect(() => {
    if (!configured) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      reload();
      setLastUpdate(new Date());
    };
    const id = setInterval(tick, REFRESH_MS);
    return () => clearInterval(id);
  }, [configured, reload]);

  if (configured === null) return <DashboardSkeleton />;
  if (!configured) return <SetupGuide />;

  const filings = data ?? [];
  const summaries = filings.map(summarize);
  const stats = computeStats(summaries);
  const clusters = q ? [] : computeClusterBuys(summaries);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {q ? `Results for “${q}”` : "Insider filings"}
            {!q && (
              <span className="live-badge" title="This page re-checks the database every minute.">
                <span className="live-dot" aria-hidden="true" />
                Live
                {lastUpdate && (
                  <span className="live-time">
                    {" · updated "}
                    {lastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </span>
            )}
          </h1>
          <p className="subtitle">
            {loading
              ? "Loading filings…"
              : q
                ? `${filings.length} filing(s) matching ticker, company, or insider.`
                : "Latest Form 4 filings from SEC EDGAR, updated as insiders file — buys shown first."}
          </p>
        </div>
      </div>

      <SearchBar />

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <>
          <StatCards stats={stats} />
          {!q && <ClusterBuys clusters={clusters} />}
          <FilingsExplorer filings={summaries} />
        </>
      )}
    </>
  );
}
