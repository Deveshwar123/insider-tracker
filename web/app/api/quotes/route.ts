// Returns delayed current prices for a set of tickers, used to fill the
// "Current Price" column. Quotes come from Yahoo's public v8 chart endpoint
// (no API key). Cached in-memory with a TTL so repeat loads are instant and we
// stay polite. Any ticker that can't be resolved comes back as null (the table
// shows "—") rather than failing the whole request.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { price: number | null; ts: number }>();

async function fetchOne(ticker: string): Promise<number | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

/** Resolve quotes with a small concurrency pool, honouring the cache. */
async function resolve(tickers: string[]): Promise<Record<string, number | null>> {
  const now = Date.now();
  const out: Record<string, number | null> = {};
  const todo: string[] = [];

  for (const t of tickers) {
    const hit = cache.get(t);
    if (hit && now - hit.ts < TTL_MS) out[t] = hit.price;
    else todo.push(t);
  }

  const POOL = 8;
  let i = 0;
  async function worker() {
    while (i < todo.length) {
      const t = todo[i++];
      const price = await fetchOne(t);
      cache.set(t, { price, ts: Date.now() });
      out[t] = price;
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, todo.length) }, worker));
  return out;
}

export async function POST(req: Request) {
  let tickers: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.tickers)) {
      tickers = [...new Set(body.tickers.filter((t: unknown) => typeof t === "string" && t))].slice(
        0,
        500
      ) as string[];
    }
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (tickers.length === 0) return NextResponse.json({ quotes: {} });
  const quotes = await resolve(tickers);
  return NextResponse.json({ quotes });
}
