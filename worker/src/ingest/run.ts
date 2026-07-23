// Orchestrates one ingestion pass over a range of days.
//
// For each day:
//   1. Fetch the Form 4 daily index.
//   2. Dedupe against the DB by accession_no (skip already-stored filings).
//   3. Download + parse each new filing.
//   4. Save it (issuer, insider, filing, transactions).
// A single bad filing is logged and counted, but never aborts the batch.

import { fetchForm4Index, type Form4IndexEntry } from "../edgar/index-fetcher.js";
import { fetchRecentForm4s } from "../edgar/recent-feed.js";
import { fetchAndParseForm4 } from "../edgar/form4-parser.js";
import { findExistingAccessions, saveFiling, startRun, finishRun } from "../db/supabase.js";
import { log } from "../util/log.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dedupe against the DB, then fetch/parse/save what's left. Shared by the daily
 * sweep and the live feed so both behave identically: a single bad filing is
 * logged and counted, never fatal.
 */
async function ingestEntries(
  entries: Form4IndexEntry[]
): Promise<{ seen: number; created: number; errors: number }> {
  if (entries.length === 0) return { seen: 0, created: 0, errors: 0 };

  const existing = await findExistingAccessions(entries.map((e) => e.accessionNo));
  const fresh = entries.filter((e) => !existing.has(e.accessionNo));

  log.info("Dedupe complete", {
    seen: entries.length,
    already: existing.size,
    toProcess: fresh.length,
  });

  let created = 0;
  let errors = 0;

  for (const entry of fresh) {
    try {
      const parsed = await fetchAndParseForm4(entry);
      await saveFiling(entry, parsed);
      created++;
    } catch (err) {
      errors++;
      log.error("Failed to ingest filing (skipping)", {
        accession: entry.accessionNo,
        url: entry.submissionTxtUrl,
        error: (err as Error).message,
      });
    }
  }

  return { seen: entries.length, created, errors };
}

/** Process a single calendar day. Returns counters for the run log. */
async function ingestDay(date: Date): Promise<{ seen: number; created: number; errors: number }> {
  log.info("Ingesting day", { date: isoDate(date) });
  return ingestEntries(await fetchForm4Index(date));
}

/**
 * Live mode: ingest whatever EDGAR has published most recently. Cheap enough to
 * run every few minutes, which is what makes the dashboard update as insiders
 * file rather than once a night.
 */
export async function runRecentIngestion(maxPages = 3): Promise<void> {
  const runId = await startRun(isoDate(new Date()));
  try {
    const entries = await fetchRecentForm4s(maxPages);
    const { seen, created, errors } = await ingestEntries(entries);

    await finishRun(runId, {
      filings_seen: seen,
      filings_new: created,
      errors,
      status: "success",
      notes: `Live feed poll (${maxPages} page(s)).`,
    });

    log.info("Live poll complete", { seen, new: created, errors });
  } catch (err) {
    await finishRun(runId, {
      filings_seen: 0,
      filings_new: 0,
      errors: 1,
      status: "failed",
      notes: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Ingest `days` completed calendar days, ending YESTERDAY (UTC). days=1 →
 * just yesterday.
 *
 * Deliberately not today: EDGAR publishes a day's `master.<date>.idx` hours
 * after that day closes, so asking for today's index returns "not published"
 * (403) — which is exactly how this job ingested nothing for a month while the
 * 23:00 UTC cron reported success. Today's filings are covered by the live feed
 * (`--recent`); this sweep is the completeness pass over finished days.
 *
 * Weekends/holidays simply yield empty indexes and are skipped.
 */
export async function runIngestion(days: number): Promise<void> {
  const today = new Date();
  const targetDateStr = isoDate(today);
  const runId = await startRun(targetDateStr);

  let totalSeen = 0;
  let totalNew = 0;
  let totalErrors = 0;

  try {
    for (let i = 1; i <= days; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const { seen, created, errors } = await ingestDay(d);
      totalSeen += seen;
      totalNew += created;
      totalErrors += errors;
    }

    // "No index available" is reported as 403, which is indistinguishable from
    // being blocked. So a run that saw nothing at all across every requested day
    // is treated as a failure rather than a quiet success — the silence is the
    // thing that hid a month of missing data.
    if (totalSeen === 0) {
      const msg =
        `No daily index was available for any of the last ${days} day(s). ` +
        `EDGAR may not have published yet, or access was refused.`;
      await finishRun(runId, {
        filings_seen: 0,
        filings_new: 0,
        errors: totalErrors + 1,
        status: "failed",
        notes: msg,
      });
      throw new Error(msg);
    }

    await finishRun(runId, {
      filings_seen: totalSeen,
      filings_new: totalNew,
      errors: totalErrors,
      status: "success",
      notes: `Ingested ${days} day(s).`,
    });

    log.info("Ingestion complete", {
      days,
      seen: totalSeen,
      new: totalNew,
      errors: totalErrors,
    });
  } catch (err) {
    await finishRun(runId, {
      filings_seen: totalSeen,
      filings_new: totalNew,
      errors: totalErrors + 1,
      status: "failed",
      notes: (err as Error).message,
    });
    throw err;
  }
}
