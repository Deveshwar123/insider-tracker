"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "./icons";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg("Pulling latest filings from SEC EDGAR…");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Refresh failed");
      if (data.new > 0) {
        setMsg(
          data.remaining > 0
            ? `Added ${data.new} — ${data.remaining} more pending, click again.`
            : `Added ${data.new} new filing(s).`
        );
      } else {
        setMsg("Up to date — no new filings.");
      }
      router.refresh(); // re-run the server component so new rows appear
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
