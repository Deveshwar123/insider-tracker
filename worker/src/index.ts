// Worker entrypoint.
//
// Usage:
//   npm run ingest             -> ingest today only (1 day)
//   npm run ingest:days 7      -> ingest the last 7 calendar days (backfill)
//   tsx src/index.ts --days 30 -> same, explicit flag
//
// worker/.env is loaded by ./env.js, which must be imported before anything
// that reads env at module scope.

// Must come first: it populates process.env before config.js validates it.
import "./env.js";
import { runIngestion, runRecentIngestion } from "./ingest/run.js";
import { log } from "./util/log.js";

function parseDays(argv: string[]): number {
  const idx = argv.indexOf("--days");
  let raw: string | undefined;
  if (idx !== -1) raw = argv[idx + 1];
  else raw = argv.find((a) => /^\d+$/.test(a)); // allow bare number via npm run ingest:days 7
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function parsePages(argv: string[]): number {
  const idx = argv.indexOf("--pages");
  const n = idx !== -1 ? Number(argv[idx + 1]) : 3;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

async function main() {
  const argv = process.argv.slice(2);

  // --recent polls EDGAR's live "latest filings" feed instead of the daily
  // index, so a short-interval cron picks trades up minutes after they publish.
  if (argv.includes("--recent")) {
    const pages = parsePages(argv);
    log.info("Worker starting (live feed)", { pages });
    await runRecentIngestion(pages);
    return;
  }

  const days = parseDays(argv);
  log.info("Worker starting", { days });
  await runIngestion(days);
}

main().catch((err) => {
  log.error("Worker failed", { error: (err as Error).message });
  process.exit(1);
});
