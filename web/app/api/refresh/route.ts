// POST /api/refresh — pulls the latest trading day's NEW Form 4 filings from
// SEC EDGAR and writes them to Supabase. Runs inline (serverless-native), so it
// works identically in local dev and on Vercel. Bounded per call (see CAP in
// lib/ingest) to fit the function time budget; if more remain, the response
// says so and the user can click again.

import { NextResponse } from "next/server";
import { refreshLatest } from "@/lib/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await refreshLatest();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
