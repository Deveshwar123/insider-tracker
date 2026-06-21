"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { FilingSummary } from "@/lib/types";
import { fmtCompactNumber, fmtDate, fmtMoney, fmtNumber, timeAgo } from "@/lib/format";

type Side = "all" | "buys" | "sells";
type SortCol = "date" | "shares" | "price" | "value";
type SortDir = "asc" | "desc";

// Buys this large get a 🔥 flag — big open-market conviction.
const NOTABLE_VALUE = 1_000_000;

export default function FilingsExplorer({ filings }: { filings: FilingSummary[] }) {
  const [side, setSide] = useState<Side>("buys");
  const [text, setText] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(col: SortCol) {
    if (col === sortCol) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    const filtered = filings.filter((f) => {
      if (side === "buys" && f.direction !== "A") return false;
      if (side === "sells" && f.direction !== "D") return false;
      if (q) {
        const hay = `${f.ticker ?? ""} ${f.company ?? ""} ${f.insider ?? ""} ${f.codeLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const val = (f: FilingSummary): number | string => {
      switch (sortCol) {
        case "shares":
          return f.shares ?? -1;
        case "price":
          return f.price ?? -1;
        case "value":
          return f.value ?? -1;
        default:
          return f.filing_date;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // stable tiebreak: bigger value first
      return (b.value ?? -1) - (a.value ?? -1);
    });
  }, [filings, side, text, sortCol, sortDir]);

  const counts = useMemo(() => {
    let buys = 0;
    let sells = 0;
    for (const f of filings) {
      if (f.direction === "A") buys++;
      else if (f.direction === "D") sells++;
    }
    return { all: filings.length, buys, sells };
  }, [filings]);

  // Current prices, loaded progressively from /api/quotes (delayed Yahoo data).
  // undefined = not fetched yet, null = no quote available.
  const [quotes, setQuotes] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const tickers = [...new Set(filings.map((f) => f.ticker).filter((t): t is string => !!t))];
    if (tickers.length === 0) return;
    let cancelled = false;
    const chunks: string[][] = [];
    for (let i = 0; i < tickers.length; i += 40) chunks.push(tickers.slice(i, i + 40));
    chunks.forEach(async (chunk) => {
      try {
        const res = await fetch("/api/quotes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: chunk }),
        });
        const data = await res.json();
        if (!cancelled && data?.quotes) setQuotes((prev) => ({ ...prev, ...data.quotes }));
      } catch {
        /* leave as "—" */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filings]);

  function plPct(f: FilingSummary, cur: number): { txt: string; cls: string } | null {
    if (f.direction !== "A" || !f.price || f.price <= 0) return null;
    const pl = ((cur - f.price) / f.price) * 100;
    return { txt: `${pl >= 0 ? "+" : ""}${pl.toFixed(0)}%`, cls: pl >= 0 ? "pos" : "neg" };
  }

  function renderCurrent(f: FilingSummary) {
    if (!f.ticker) return "—";
    const cur = quotes[f.ticker]; // number | null | undefined
    if (cur === undefined) return <span className="skeleton" aria-label="loading price" />;
    if (cur === null) return "—";
    const pl = plPct(f, cur);
    return (
      <>
        {fmtMoney(cur)}
        {pl && <span className={`pl ${pl.cls}`}>{pl.txt}</span>}
      </>
    );
  }

  function renderStatus(f: FilingSummary) {
    const o = f.sharesOwnedAfter;
    if (o == null) return <span className="status unknown">—</span>;
    if (o > 0)
      return (
        <span className="status holding" title={`${fmtNumber(o)} shares owned after this filing`}>
          Holding
        </span>
      );
    return (
      <span className="status exited" title="0 shares owned after this filing">
        Exited
      </span>
    );
  }

  function exportCsv() {
    const header = [
      "Filed",
      "Type",
      "Ticker",
      "Company",
      "Insider",
      "Relationship",
      "Code",
      "Shares",
      "Entry Price",
      "Current Price",
      "Value",
      "Position",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((f) =>
      [
        f.filing_date,
        f.direction === "A" ? "Buy" : f.direction === "D" ? "Sell" : "",
        f.ticker,
        f.company,
        f.insider,
        f.relationship,
        f.code,
        f.shares,
        f.price,
        f.ticker ? quotes[f.ticker] ?? "" : "",
        f.value,
        f.sharesOwnedAfter == null ? "" : f.sharesOwnedAfter > 0 ? "Holding" : "Exited",
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insider-filings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const arrow = (col: SortCol) =>
    sortCol === col ? <span className="arrow">{sortDir === "asc" ? "▲" : "▼"}</span> : null;

  return (
    <div className="explorer">
      <div className="controls">
        <div className="segmented" role="tablist" aria-label="Filter by side">
          <button className={side === "all" ? "active" : ""} onClick={() => setSide("all")}>
            All <span className="count">{counts.all}</span>
          </button>
          <button className={side === "buys" ? "active buy" : "buy"} onClick={() => setSide("buys")}>
            Buys <span className="count">{counts.buys}</span>
          </button>
          <button
            className={side === "sells" ? "active sell" : "sell"}
            onClick={() => setSide("sells")}
          >
            Sells <span className="count">{counts.sells}</span>
          </button>
        </div>

        <input
          className="filter-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter these rows by ticker, company, insider…"
          aria-label="Filter rows"
        />

        <button className="ghost-btn" onClick={exportCsv} disabled={rows.length === 0}>
          ⤓ Export CSV
        </button>
      </div>

      <p className="result-count">
        Showing {rows.length.toLocaleString()} of {filings.length.toLocaleString()} filings
        <span className="hint-inline"> · click a column header to sort</span>
      </p>

      {rows.length === 0 ? (
        <div className="empty">No filings match this filter.</div>
      ) : (
        <div className="table-wrap big">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("date")}>
                  Filed {arrow("date")}
                </th>
                <th>Date</th>
                <th>Type</th>
                <th>Ticker</th>
                <th>Company</th>
                <th>Insider</th>
                <th>Relationship</th>
                <th>Code</th>
                <th className="num sortable" onClick={() => toggleSort("shares")}>
                  Shares {arrow("shares")}
                </th>
                <th className="num sortable" onClick={() => toggleSort("price")}>
                  Entry Price {arrow("price")}
                </th>
                <th className="num">Current</th>
                <th className="num sortable" onClick={() => toggleSort("value")}>
                  Value {arrow("value")}
                </th>
                <th>Position</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const notable = f.direction === "A" && (f.value ?? 0) >= NOTABLE_VALUE;
                return (
                  <tr key={f.accession_no} className={notable ? "notable-row" : ""}>
                    <td title={fmtDate(f.filing_date)}>{timeAgo(f.filing_date)}</td>
                    <td className="exact-date">{fmtDate(f.filing_date)}</td>
                    <td>
                      {f.direction === "A" ? (
                        <span className="badge-side buy">{notable ? "🔥 Buy" : "Buy"}</span>
                      ) : f.direction === "D" ? (
                        <span className="badge-side sell">Sell</span>
                      ) : (
                        <span className="badge">—</span>
                      )}
                    </td>
                    <td>
                      {f.ticker && f.companyCik ? (
                        <Link href={`/company/${f.companyCik}`} className="ticker-chip">
                          {f.ticker}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="company-cell" title={f.company ?? undefined}>
                      {f.company && f.companyCik ? (
                        <Link href={`/company/${f.companyCik}`}>{f.company}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="insider-cell" title={f.insider ?? undefined}>
                      {f.insider && f.insiderCik ? (
                        <Link href={`/insider/${f.insiderCik}`}>{f.insider}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="rel-cell">{f.relationship}</td>
                    <td>{f.codeLabel}</td>
                    <td className="num" title={fmtNumber(f.shares)}>
                      {fmtCompactNumber(f.shares)}
                    </td>
                    <td className="num">{fmtMoney(f.price)}</td>
                    <td className="price-cell">{renderCurrent(f)}</td>
                    <td className="num strong">{fmtMoney(f.value)}</td>
                    <td>{renderStatus(f)}</td>
                    <td>
                      <Link href={`/filing/${f.accession_no}`}>Details →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
