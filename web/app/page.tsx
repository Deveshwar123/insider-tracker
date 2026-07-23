import { Suspense } from "react";
import SearchBar from "./components/SearchBar";
import FilingsExplorer from "./components/FilingsExplorer";
import RefreshButton from "./components/RefreshButton";
import LiveUpdater from "./components/LiveUpdater";
import StatCards from "./components/StatCards";
import ClusterBuys from "./components/ClusterBuys";
import SetupGuide from "./components/SetupGuide";
import { getLatestFilings, searchFilings } from "@/lib/queries";
import { isConfigured } from "@/lib/supabase";
import { summarize } from "@/lib/summary";
import { computeStats, computeClusterBuys } from "@/lib/stats";

// Always render fresh data (the worker updates the DB out of band).
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  // A fresh clone has no credentials — explain the setup instead of throwing.
  if (!isConfigured) return <SetupGuide />;

  const q = searchParams.q?.trim() ?? "";
  const filings = q ? await searchFilings(q) : await getLatestFilings(500);
  const summaries = filings.map(summarize);
  const stats = computeStats(summaries);
  const clusters = q ? [] : computeClusterBuys(summaries);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {q ? `Results for “${q}”` : "Insider filings"}
            {!q && <LiveUpdater />}
          </h1>
          <p className="subtitle">
            {q
              ? `${filings.length} filing(s) matching ticker, company, or insider.`
              : "Latest Form 4 filings from SEC EDGAR, updated as insiders file — buys shown first."}
          </p>
        </div>
        <RefreshButton />
      </div>

      <StatCards stats={stats} />

      {!q && <ClusterBuys clusters={clusters} />}

      <Suspense>
        <SearchBar />
      </Suspense>

      <FilingsExplorer filings={summaries} />
    </>
  );
}
