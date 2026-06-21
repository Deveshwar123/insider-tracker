import type { DashboardStats } from "@/lib/stats";
import { fmtCompactMoney } from "@/lib/format";

export default function StatCards({ stats }: { stats: DashboardStats }) {
  const sided = stats.buys + stats.sells;
  const buyPct = sided ? Math.round((stats.buys / sided) * 100) : 0;

  return (
    <div className="stat-cards">
      <div className="card">
        <div className="card-label">Recent filings</div>
        <div className="card-value">{stats.total.toLocaleString()}</div>
        <div className="card-sub">
          {stats.uniqueCompanies.toLocaleString()} companies · {stats.uniqueInsiders.toLocaleString()} insiders
        </div>
      </div>

      <div className="card">
        <div className="card-label">Buy / Sell mix</div>
        <div className="card-value">
          <span className="up">{stats.buys.toLocaleString()}</span>
          <span className="slash"> / </span>
          <span className="down">{stats.sells.toLocaleString()}</span>
        </div>
        <div className="sentiment" title={`${buyPct}% buys`}>
          <div className="sentiment-fill" style={{ width: `${buyPct}%` }} />
        </div>
        <div className="card-sub">{buyPct}% buys by count</div>
      </div>

      <div className="card">
        <div className="card-label">Buy volume</div>
        <div className="card-value up">{fmtCompactMoney(stats.buyValue)}</div>
        <div className="card-sub">shares acquired</div>
      </div>

      <div className="card">
        <div className="card-label">Sell volume</div>
        <div className="card-value down">{fmtCompactMoney(stats.sellValue)}</div>
        <div className="card-sub">shares disposed</div>
      </div>
    </div>
  );
}
