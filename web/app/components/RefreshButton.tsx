"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "./icons";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Each call ingests at most CAP filings (see lib/ingest), so a busy day needs
  // several rounds. Bounded on purpose: filings that fail every time are never
  // written, so they stay "remaining" forever — the original `while (true)`
  // then hammered SEC in an endless loop.
  const MAX_ROUNDS = 40;

  async function refresh() {
    setBusy(true);
    setMsg("Pulling latest filings from SEC EDGAR…");
    let totalNew = 0;
    let totalErrors = 0;
    let firstError: string | null = null;

    try {
      let stalled = false;
      let rounds = 0;
      for (; rounds < MAX_ROUNDS; rounds++) {
        const res = await fetch("/api/refresh", { method: "POST" });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Refresh failed");

        const added = (data.new as number) ?? 0;
        totalNew += added;
        totalErrors += (data.errors as number) ?? 0;
        if (firstError === null && data.firstError) firstError = data.firstError as string;
        const remaining = (data.remaining as number) ?? 0;

        if (remaining <= 0) break;
        // No progress this round means the remaining filings fail every time.
        // Stop instead of looping on them forever.
        if (added === 0) {
          stalled = true;
          break;
        }
        setMsg(`Fetched ${totalNew} so far — ${remaining} remaining…`);
      }

      let summary =
        totalNew > 0 ? `Added ${totalNew} new filing(s).` : "Up to date — no new filings.";
      if (totalErrors > 0) {
        summary += ` ${totalErrors} filing(s) could not be read${
          firstError ? ` (${firstError})` : ""
        }.`;
      }
      if (stalled) summary += " Stopped early — the rest kept failing.";
      else if (rounds >= MAX_ROUNDS) summary += " Stopped at the round limit — click again for more.";
      setMsg(summary);
      router.refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="refresh">
      <button onClick={refresh} disabled={busy}>
        <RefreshCw size={15} className={busy ? "spin" : undefined} />
        {busy ? "Refreshing…" : "Refresh from SEC EDGAR"}
      </button>
      {msg && <span className="refresh-msg">{msg}</span>}
    </div>
  );
}
