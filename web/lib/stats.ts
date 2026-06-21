// Aggregations the dashboard shows above the table: headline stats and the
// "cluster buy" signal. All derived from the already-loaded summaries, so no
// extra DB round-trips.

import type { FilingSummary } from "./types";

export interface DashboardStats {
  total: number;
  buys: number;
  sells: number;
  buyValue: number;
  sellValue: number;
  uniqueCompanies: number;
  uniqueInsiders: number;
}

export function computeStats(rows: FilingSummary[]): DashboardStats {
  let buys = 0;
  let sells = 0;
  let buyValue = 0;
  let sellValue = 0;
  const companies = new Set<number>();
  const insiders = new Set<number>();

  for (const r of rows) {
    if (r.companyCik != null) companies.add(r.companyCik);
    if (r.insiderCik != null) insiders.add(r.insiderCik);
    if (r.direction === "A") {
      buys++;
      if (r.value) buyValue += r.value;
    } else if (r.direction === "D") {
      sells++;
      if (r.value) sellValue += r.value;
    }
  }

  return {
    total: rows.length,
    buys,
    sells,
    buyValue,
    sellValue,
    uniqueCompanies: companies.size,
    uniqueInsiders: insiders.size,
  };
}

export interface ClusterBuy {
  companyCik: number;
  ticker: string | null;
  company: string | null;
  insiderCount: number;
  filingCount: number;
  totalValue: number;
}

/**
 * Companies where two or more *distinct* insiders bought (acquired) within the
 * loaded window. Cluster buying is a stronger signal than a lone purchase, so
 * we surface it prominently. Returns the strongest few, by insider count then $.
 */
export function computeClusterBuys(rows: FilingSummary[], minInsiders = 2): ClusterBuy[] {
  const byCompany = new Map<
    number,
    { ticker: string | null; company: string | null; insiders: Set<number>; filings: number; value: number }
  >();

  for (const r of rows) {
    if (r.direction !== "A" || r.companyCik == null) continue;
    let g = byCompany.get(r.companyCik);
    if (!g) {
      g = { ticker: r.ticker, company: r.company, insiders: new Set(), filings: 0, value: 0 };
      byCompany.set(r.companyCik, g);
    }
    if (r.insiderCik != null) g.insiders.add(r.insiderCik);
    g.filings++;
    if (r.value) g.value += r.value;
  }

  const out: ClusterBuy[] = [];
  for (const [cik, g] of byCompany) {
    if (g.insiders.size >= minInsiders) {
      out.push({
        companyCik: cik,
        ticker: g.ticker,
        company: g.company,
        insiderCount: g.insiders.size,
        filingCount: g.filings,
        totalValue: g.value,
      });
    }
  }
  out.sort((a, b) => b.insiderCount - a.insiderCount || b.totalValue - a.totalValue);
  return out.slice(0, 10);
}
