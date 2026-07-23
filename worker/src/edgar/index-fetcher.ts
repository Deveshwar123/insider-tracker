// Fetches EDGAR's daily index and extracts the Form 4 filings for a date.
//
// We use the pipe-delimited `master.<YYYYMMDD>.idx` daily index because it is
// trivial to parse:
//   CIK|Company Name|Form Type|Date Filed|Filename
//   320193|Apple Inc.|4|2025-06-20|edgar/data/320193/0000320193-25-000077.txt
//
// The "Filename" is the full submission .txt, from which we derive the
// accession number and build the human-readable index URL.

import { edgarFetch } from "./client.js";
import { config } from "../config.js";
import { log } from "../util/log.js";

export interface Form4IndexEntry {
  cik: number;
  companyName: string;
  formType: string; // "4" or "4/A"
  dateFiled: string; // YYYY-MM-DD
  accessionNo: string; // 0000320193-25-000077
  submissionTxtUrl: string; // full submission .txt (contains the XML)
  sourceUrl: string; // human-readable -index.htm page
}

function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** Format a Date as YYYYMMDD in UTC. */
function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Accession with dashes removed → folder name in the Archives path. */
function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

/**
 * Fetch the daily master index for a date and return only Form 4 (+ 4/A) rows.
 * Returns [] when EDGAR has no index for that day (weekend / holiday).
 */
export async function fetchForm4Index(date: Date): Promise<Form4IndexEntry[]> {
  const y = date.getUTCFullYear();
  const qtr = quarterOf(date.getUTCMonth() + 1);
  const url = `${config.edgar.baseUrl}/Archives/edgar/daily-index/${y}/QTR${qtr}/master.${yyyymmdd(
    date
  )}.idx`;

  let raw: string;
  try {
    raw = await edgarFetch<string>(url);
  } catch (err) {
    // EDGAR serves the archive from S3 without list permission, so a file that
    // does not exist comes back as 403 AccessDenied, NOT 404. Both therefore
    // mean "no index published for this date" — weekend, holiday, or a day
    // EDGAR hasn't finalised yet (today's index lands well after 23:00 UTC).
    // Anything else (429, 5xx, network) is a real failure and is rethrown.
    //
    // Because 403 is ambiguous, "no index" alone can't be trusted as healthy —
    // runIngestion additionally fails a run where *no* day yielded anything.
    const status = (err as Error & { status?: number }).status;
    if (status === 403 || status === 404) {
      log.warn("No daily index published for date", { date: yyyymmdd(date), status });
      return [];
    }
    log.error("Daily index fetch failed", {
      date: yyyymmdd(date),
      status,
      error: (err as Error).message,
    });
    throw err;
  }

  const entries: Form4IndexEntry[] = [];
  for (const line of raw.split("\n")) {
    // Index rows are pipe-delimited; the header/preamble lines are not.
    const parts = line.split("|");
    if (parts.length !== 5) continue;

    const [cikStr, companyName, formType, dateFiled, filename] = parts as [
      string,
      string,
      string,
      string,
      string
    ];

    if (formType !== "4" && formType !== "4/A") continue;

    const cik = Number(cikStr);
    if (!Number.isFinite(cik)) continue;

    // filename: edgar/data/320193/0000320193-25-000077.txt
    const base = filename.trim().split("/").pop() ?? "";
    const accessionNo = base.replace(/\.txt$/i, "");
    if (!accessionNo) continue;

    const folder = accessionNoDashes(accessionNo);
    entries.push({
      cik,
      companyName: companyName.trim(),
      formType,
      dateFiled: dateFiled.trim(),
      accessionNo,
      submissionTxtUrl: `${config.edgar.baseUrl}/Archives/${filename.trim()}`,
      sourceUrl: `${config.edgar.baseUrl}/Archives/edgar/data/${cik}/${folder}/${accessionNo}-index.htm`,
    });
  }

  log.info("Fetched daily Form 4 index", {
    date: yyyymmdd(date),
    count: entries.length,
  });
  return entries;
}
