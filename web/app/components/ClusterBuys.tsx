import Link from "next/link";
import type { ClusterBuy } from "@/lib/stats";
import { fmtCompactMoney } from "@/lib/format";

export default function ClusterBuys({ clusters }: { clusters: ClusterBuy[] }) {
  if (clusters.length === 0) return null;

  return (
    <section className="clusters">
      <div className="clusters-head">
        <h2>🔥 Cluster buys</h2>
        <span className="hint">
          Multiple insiders buying the same company in this window — a notable bullish signal
        </span>
      </div>
      <div className="cluster-row">
        {clusters.map((c) => (
          <Link key={c.companyCik} href={`/company/${c.companyCik}`} className="cluster-chip">
            <span className="cluster-ticker">{c.ticker ?? c.company ?? "—"}</span>
            <span className="cluster-meta">
              <strong>{c.insiderCount}</strong> insiders · {fmtCompactMoney(c.totalValue)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
