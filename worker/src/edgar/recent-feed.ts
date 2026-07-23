// Near-real-time Form 4 source: EDGAR's "latest filings" Atom feed.
//
// The daily master index (index-fetcher.ts) is exhaustive but only useful after
// the fact — it is the right tool for a backfill, not for "show me trades as
// they are published". This feed lists filings within a couple of minutes of
// acceptance, so polling it on a short schedule keeps the dashboard current
// during the day. The nightly daily-index sweep still runs as the completeness
// backstop for anything a poll window missed.
//
// Shape of an entry (one per PARTY, so a single filing appears two or more
// times — once as Issuer, once per Reporting owner; we dedupe by accession):
//
//   <entry>
//     <title>4 - TKO Group Holdings, Inc. (0001973266) (Issuer)</title>
//     <link href=".../Archives/edgar/data/1973266/000119312526312814/0001193125-26-312814-index.htm"/>
//     <summary>&lt;b&gt;Filed:&lt;/b&gt; 2026-07-22 &lt;b&gt;AccNo:&lt;/b&gt; 0001193125-26-312814 ...</summary>
//     <updated>2026-07-22T21:40:03-04:00</updated>
//   </entry>

import { edgarFetch } from "./client.js";
import { config } from "../config.js";
import { log } from "../util/log.js";
import type { Form4IndexEntry } from "./index-fetcher.js";

/** EDGAR caps this feed at 100 entries per request; `start` pages backwards. */
const PAGE_SIZE = 100;

function feedUrl(start: number): string {
  const qs = new URLSearchParams({
    action: "getcurrent",
    type: "4",
    company: "",
    dateb: "",
    owner: "include",
    count: String(PAGE_SIZE),
    start: String(start),
    output: "atom",
  });
  return `${config.edgar.baseUrl}/cgi-bin/browse-edgar?${qs.toString()}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m?.[1] ?? null;
}

/**
 * Parse one <entry> into an index entry, or null when it isn't a usable Form 4.
 * Deliberately regex-based rather than XML-parsed: the feed is a fixed, flat
 * shape, and this avoids pulling a parser into the hot polling path.
 */
function parseEntry(block: string): (Form4IndexEntry & { isIssuer: boolean }) | null {
  const title = stripTags(firstMatch(block, /<title>([\s\S]*?)<\/title>/) ?? "");
  const href = firstMatch(block, /<link[^>]*href="([^"]+)"/) ?? "";
  const summary = stripTags(firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/) ?? "");

  // "4 - Company Name (0001973266) (Issuer)"
  const formType = title.startsWith("4/A") ? "4/A" : title.startsWith("4 ") ? "4" : null;
  if (!formType) return null;

  const accessionNo = firstMatch(summary, /AccNo:\s*([0-9]{10}-[0-9]{2}-[0-9]{6})/);
  if (!accessionNo) return null;

  const dateFiled = firstMatch(summary, /Filed:\s*(\d{4}-\d{2}-\d{2})/);
  if (!dateFiled) return null;

  // The archive path carries the CIK whose folder the document lives under.
  const cik = Number(firstMatch(href, /\/edgar\/data\/(\d+)\//) ?? "");
  if (!Number.isFinite(cik) || cik <= 0) return null;

  const companyName = (firstMatch(title, /^4(?:\/A)?\s*-\s*(.+?)\s*\(\d+\)/) ?? "").trim();
  const isIssuer = /\(Issuer\)\s*$/.test(title);
  const folder = accessionNo.replace(/-/g, "");

  return {
    cik,
    companyName,
    formType,
    dateFiled,
    accessionNo,
    submissionTxtUrl: `${config.edgar.baseUrl}/Archives/edgar/data/${cik}/${folder}/${accessionNo}.txt`,
    sourceUrl: `${config.edgar.baseUrl}/Archives/edgar/data/${cik}/${folder}/${accessionNo}-index.htm`,
    isIssuer,
  };
}

/**
 * Fetch the most recently published Form 4 filings, newest first, deduped by
 * accession number. `maxPages` bounds how far back a single poll reaches — at
 * ~2 entries per filing, one page is roughly 40–50 filings.
 */
export async function fetchRecentForm4s(maxPages = 3): Promise<Form4IndexEntry[]> {
  const byAccession = new Map<string, Form4IndexEntry>();

  for (let page = 0; page < maxPages; page++) {
    let raw: string;
    try {
      raw = await edgarFetch<string>(feedUrl(page * PAGE_SIZE));
    } catch (err) {
      log.warn("Recent-filings feed unavailable", {
        page,
        error: (err as Error).message,
      });
      break;
    }

    const blocks = raw.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
    if (blocks.length === 0) break;

    for (const block of blocks) {
      const parsed = parseEntry(block);
      if (!parsed) continue;
      const existing = byAccession.get(parsed.accessionNo);
      // Keep the Issuer entry when both are present: its title is the company
      // name, which is the better fallback if the XML omits one.
      if (!existing || (parsed.isIssuer && !(existing as { isIssuer?: boolean }).isIssuer)) {
        byAccession.set(parsed.accessionNo, parsed);
      }
    }

    // A short page means the feed is exhausted.
    if (blocks.length < PAGE_SIZE) break;
  }

  const entries = [...byAccession.values()];
  log.info("Fetched recent Form 4 feed", { filings: entries.length, maxPages });
  return entries;
}
