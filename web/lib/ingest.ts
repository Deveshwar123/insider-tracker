// Serverless-native Form 4 ingestion used by POST /api/refresh.
//
// Unlike the standalone worker (which backfills many days), this does a small,
// BOUNDED pull of the most recent trading day's *new* filings so it fits inside
// a serverless function's time budget and works the same locally and on Vercel.
// It needs server-only env: SUPABASE_SERVICE_ROLE_KEY + SEC_USER_AGENT
// (SUPABASE_URL falls back to NEXT_PUBLIC_SUPABASE_URL).

import { XMLParser } from "fast-xml-parser";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SEC_BASE = "https://www.sec.gov";
const SPACING_MS = 150; // ~6-7 req/s, well under SEC's 10/s
const MAX_RETRIES = 3;
const BACKOFF_BASE = 600;
const CAP = 20; // max new filings processed per refresh (time budget)
const LOOKBACK_DAYS = 5; // skip weekends/holidays to find the latest index

// ---- supabase admin client (service role — server only) -------------------
function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Refresh needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server env).");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---- polite EDGAR fetch ----------------------------------------------------
let lastReq = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = SPACING_MS - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();
}

async function edgarFetch(url: string): Promise<string> {
  const ua = process.env.SEC_USER_AGENT;
  if (!ua) throw new Error("Refresh needs SEC_USER_AGENT (server env).");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua, "Accept-Encoding": "gzip, deflate" },
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(BACKOFF_BASE * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`EDGAR ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      await sleep(BACKOFF_BASE * 2 ** attempt);
    }
  }
  throw new Error(`EDGAR retries exhausted: ${url}`);
}

// ---- daily index -----------------------------------------------------------
interface IndexEntry {
  cik: number;
  companyName: string;
  formType: string;
  dateFiled: string;
  accessionNo: string;
  submissionTxtUrl: string;
  sourceUrl: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function yyyymmdd(d: Date): string {
  return isoDate(d).replace(/-/g, "");
}
function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

async function fetchForm4Index(date: Date): Promise<IndexEntry[]> {
  const y = date.getUTCFullYear();
  const qtr = quarterOf(date.getUTCMonth() + 1);
  const url = `${SEC_BASE}/Archives/edgar/daily-index/${y}/QTR${qtr}/master.${yyyymmdd(date)}.idx`;
  let raw: string;
  try {
    raw = await edgarFetch(url);
  } catch {
    return []; // weekend / holiday / not yet published
  }
  const entries: IndexEntry[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|");
    if (parts.length !== 5) continue;
    const [cikStr, companyName, formType, dateFiled, filename] = parts;
    if (formType !== "4" && formType !== "4/A") continue;
    const cik = Number(cikStr);
    if (!Number.isFinite(cik)) continue;
    const base = filename.trim().split("/").pop() ?? "";
    const accessionNo = base.replace(/\.txt$/i, "");
    if (!accessionNo) continue;
    const folder = accessionNo.replace(/-/g, "");
    entries.push({
      cik,
      companyName: companyName.trim(),
      formType,
      dateFiled: dateFiled.trim(),
      accessionNo,
      submissionTxtUrl: `${SEC_BASE}/Archives/${filename.trim()}`,
      sourceUrl: `${SEC_BASE}/Archives/edgar/data/${cik}/${folder}/${accessionNo}-index.htm`,
    });
  }
  return entries;
}

// ---- Form 4 XML parser (ported from worker, defensive) --------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

interface ParsedTx {
  securityTitle: string | null;
  isDerivative: boolean;
  transactionDate: string | null;
  transactionCode: string | null;
  shares: number | null;
  pricePerShare: number | null;
  acquiredDisposed: string | null;
  sharesOwnedAfter: number | null;
  ownershipType: string | null;
  footnoteIds: string | null;
}
interface Parsed {
  issuerCik: number | null;
  issuerName: string | null;
  issuerTicker: string | null;
  insiderCik: number | null;
  insiderName: string | null;
  insiderTitle: string | null;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPct: boolean | null;
  periodOfReport: string | null;
  transactions: ParsedTx[];
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
function val(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "object" && "value" in (node as Record<string, unknown>)) {
    const v = (node as Record<string, unknown>).value;
    return v == null ? null : String(v).trim();
  }
  if (typeof node === "object") return null;
  const s = String(node).trim();
  return s === "" ? null : s;
}
function num(node: unknown): number | null {
  const s = val(node);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function intCik(node: unknown): number | null {
  const s = typeof node === "object" ? val(node) : node == null ? null : String(node);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bool01(node: unknown): boolean | null {
  const s = val(node);
  if (s == null) return null;
  if (s === "1" || s.toLowerCase() === "true") return true;
  if (s === "0" || s.toLowerCase() === "false") return false;
  return null;
}
function footnotes(node: Record<string, unknown>): string | null {
  const ids = new Set<string>();
  const walk = (o: unknown) => {
    if (o == null || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === "footnoteId") {
        for (const f of toArray(v)) {
          const id = (f as Record<string, unknown>)?.["@_id"];
          if (id) ids.add(String(id));
        }
      } else if (typeof v === "object") walk(v);
    }
  };
  walk(node);
  return ids.size ? [...ids].join(",") : null;
}
function mapTx(node: Record<string, unknown>, isDerivative: boolean): ParsedTx {
  const coding = (node.transactionCoding ?? {}) as Record<string, unknown>;
  const amounts = (node.transactionAmounts ?? {}) as Record<string, unknown>;
  const post = (node.postTransactionAmounts ?? {}) as Record<string, unknown>;
  const nature = (node.ownershipNature ?? {}) as Record<string, unknown>;
  return {
    securityTitle: val(node.securityTitle),
    isDerivative,
    transactionDate: val(node.transactionDate),
    transactionCode: val(coding.transactionCode),
    shares: num(amounts.transactionShares),
    pricePerShare: num(amounts.transactionPricePerShare),
    acquiredDisposed: val(amounts.transactionAcquiredDisposedCode),
    sharesOwnedAfter: num(post.sharesOwnedFollowingTransaction),
    ownershipType: val(nature.directOrIndirectOwnership),
    footnoteIds: footnotes(node),
  };
}
function parseForm4Xml(xml: string): Parsed {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.ownershipDocument ?? {}) as Record<string, unknown>;
  const issuer = (root.issuer ?? {}) as Record<string, unknown>;
  const owner = (toArray(root.reportingOwner)[0] ?? {}) as Record<string, unknown>;
  const ownerId = (owner.reportingOwnerId ?? {}) as Record<string, unknown>;
  const rel = (owner.reportingOwnerRelationship ?? {}) as Record<string, unknown>;
  const nonDeriv = (root.nonDerivativeTable ?? {}) as Record<string, unknown>;
  const deriv = (root.derivativeTable ?? {}) as Record<string, unknown>;
  const transactions: ParsedTx[] = [
    ...toArray(nonDeriv.nonDerivativeTransaction as Record<string, unknown>[]).map((t) =>
      mapTx(t, false)
    ),
    ...toArray(deriv.derivativeTransaction as Record<string, unknown>[]).map((t) => mapTx(t, true)),
  ];
  return {
    issuerCik: intCik(issuer.issuerCik),
    issuerName: val(issuer.issuerName),
    issuerTicker: val(issuer.issuerTradingSymbol),
    insiderCik: intCik(ownerId.rptOwnerCik),
    insiderName: val(ownerId.rptOwnerName),
    insiderTitle: val(rel.officerTitle),
    isDirector: bool01(rel.isDirector),
    isOfficer: bool01(rel.isOfficer),
    isTenPct: bool01(rel.isTenPercentOwner),
    periodOfReport: val(root.periodOfReport),
    transactions,
  };
}
async function fetchAndParse(entry: IndexEntry): Promise<Parsed> {
  const submission = await edgarFetch(entry.submissionTxtUrl);
  const start = submission.indexOf("<XML>");
  const end = submission.indexOf("</XML>");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No <XML> block in ${entry.submissionTxtUrl}`);
  }
  return parseForm4Xml(submission.slice(start + 5, end).trim());
}

// ---- DB writes (mirror worker saveFiling) ---------------------------------
async function findExisting(db: SupabaseClient, accessions: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < accessions.length; i += 200) {
    const batch = accessions.slice(i, i + 200);
    const { data, error } = await db.from("filings").select("accession_no").in("accession_no", batch);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) found.add(r.accession_no as string);
  }
  return found;
}

async function saveFiling(db: SupabaseClient, entry: IndexEntry, parsed: Parsed): Promise<void> {
  if (parsed.issuerCik != null) {
    await db.from("issuers").upsert(
      {
        cik: parsed.issuerCik,
        name: parsed.issuerName ?? entry.companyName ?? "Unknown",
        ticker: parsed.issuerTicker ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cik" }
    );
  }
  if (parsed.insiderCik != null) {
    await db.from("insiders").upsert(
      { cik: parsed.insiderCik, name: parsed.insiderName ?? "Unknown", updated_at: new Date().toISOString() },
      { onConflict: "cik" }
    );
  }
  const { data: filingRow, error: filingErr } = await db
    .from("filings")
    .upsert(
      {
        accession_no: entry.accessionNo,
        form_type: entry.formType,
        issuer_cik: parsed.issuerCik,
        insider_cik: parsed.insiderCik,
        filing_date: entry.dateFiled,
        period_of_report: parsed.periodOfReport,
        insider_title: parsed.insiderTitle,
        is_director: parsed.isDirector,
        is_officer: parsed.isOfficer,
        is_ten_pct: parsed.isTenPct,
        source_url: entry.sourceUrl,
        raw_xml_url: entry.submissionTxtUrl,
      },
      { onConflict: "accession_no" }
    )
    .select("id")
    .single();
  if (filingErr) throw new Error(filingErr.message);
  const filingId = filingRow!.id as number;

  if (parsed.transactions.length > 0) {
    const rows = parsed.transactions.map((t, i) => ({
      filing_id: filingId,
      security_title: t.securityTitle,
      is_derivative: t.isDerivative,
      transaction_date: t.transactionDate,
      transaction_code: t.transactionCode,
      shares: t.shares,
      price_per_share: t.pricePerShare,
      acquired_disposed: t.acquiredDisposed,
      shares_owned_after: t.sharesOwnedAfter,
      ownership_type: t.ownershipType,
      footnote_ids: t.footnoteIds,
      line_no: i,
    }));
    const { error: txErr } = await db
      .from("transactions")
      .upsert(rows, { onConflict: "filing_id,line_no" });
    if (txErr) throw new Error(txErr.message);
  }
}

// ---- orchestrator ----------------------------------------------------------
export interface RefreshResult {
  new: number;
  processed: number;
  remaining: number;
  date: string | null;
}

export async function refreshLatest(): Promise<RefreshResult> {
  const db = admin();
  let entries: IndexEntry[] = [];
  let usedDate: string | null = null;
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const e = await fetchForm4Index(d);
    if (e.length) {
      entries = e;
      usedDate = isoDate(d);
      break;
    }
  }
  if (entries.length === 0) return { new: 0, processed: 0, remaining: 0, date: null };

  const existing = await findExisting(db, entries.map((e) => e.accessionNo));
  const fresh = entries.filter((e) => !existing.has(e.accessionNo));
  const batch = fresh.slice(0, CAP);

  let created = 0;
  for (const entry of batch) {
    try {
      const parsed = await fetchAndParse(entry);
      await saveFiling(db, entry, parsed);
      created++;
    } catch {
      // one bad filing never aborts the batch
    }
  }
  return { new: created, processed: batch.length, remaining: fresh.length - batch.length, date: usedDate };
}
