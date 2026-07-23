# Insider Tracker

A free, self-hosted web app that tracks **SEC Form 4 insider-trading filings** from
official [SEC EDGAR](https://www.sec.gov/edgar) public data.

**Bring your own database.** This repo ships with no keys and no data. You point it
at a free Supabase project that *you* own, and run it on your own machine — your
credentials never leave it, and there is no shared server holding your data. Clone
it, paste your two keys into `web/.env.local`, run `npm run dev`.

> If you start the app before configuring it, it shows a setup page walking through
> exactly these steps rather than an error.

This is **Stage 1 (MVP)**: Form 4 ingestion + a searchable dashboard. The roadmap
extends through better parsing & history pages (Stage 2), 13D/13G support (Stage 3),
watchlists & alerts (Stage 4), and polish/scaling (Stage 5).

```
insider-tracker/
├── supabase/migrations/   # SQL schema (run in Supabase)
├── worker/                # Node/TS ingestion worker (fetches EDGAR → Postgres)
├── web/                   # Next.js dashboard (reads Postgres)
└── .github/workflows/     # Scheduled ingestion (GitHub Actions cron)
```

## Architecture in one line

A scheduled **worker** pulls Form 4 filings from EDGAR and writes normalized rows to
**Supabase Postgres**; the **Next.js** app only ever *reads* that database. The app
never calls EDGAR on a user request, so it's fast and never hits rate limits.

---

## Which key goes where

Two different keys, and mixing them up is the one mistake worth avoiding:

| Key | Goes in | Safe to expose? |
|---|---|---|
| **anon / publishable** (`sb_publishable_…` or `eyJ…`) | `web/.env.local` | **Yes** — public by design, read-only, ships to the browser |
| **service_role / secret** | `worker/.env` only | **No** — bypasses row-level security. Never put it in `web/`, never commit it |

`.env.local` and `.env` are both gitignored, so neither is ever committed.

---

## Setup

### 1. Create the database (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. From **Project Settings → API**, note:
   - Project URL
   - `anon` public key (for the web app)
   - `service_role` key (for the worker — keep secret)

### 2. Run the worker locally

```bash
cd worker
cp .env.example .env        # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEC_USER_AGENT
npm install
npm run ingest:recent       # live: whatever EDGAR just published
npm run ingest              # ingest today's filings (full daily index)
npm run ingest:days 7       # backfill the last 7 days
```

> **SEC_USER_AGENT is required** and must contain a real name + email, e.g.
> `Insider Tracker personal-research you@example.com`. SEC throttles/blocks
> anonymous traffic.

### 3. Run the web app locally

```bash
cd web
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + ANON key
npm install
npm run dev                        # http://localhost:3000
```

---

## Deployment (free tier)

- **Database:** Supabase free tier.
- **Web app:** Import the repo into [Vercel](https://vercel.com), set the **Root
  Directory** to `web`, and add the two `NEXT_PUBLIC_*` env vars. Deploy.
- **Running it locally is the recommended path** — and not only for privacy. SEC
  rate-limits and sometimes outright blocks cloud/datacenter IP ranges, so
  `Archives/…` fetches that work fine from a laptop can return `403` from a CI
  runner. If scheduled ingestion goes quiet, run the worker locally instead:
  `cd worker && npm run ingest:days 5`.
- **Ingestion:** Also wired as GitHub Actions cron
  ([`.github/workflows/ingest.yml`](.github/workflows/ingest.yml)). Add three repo
  secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEC_USER_AGENT`. It polls
  the live feed every 15 minutes on weekdays and does a full daily sweep at 23:00
  UTC; both can also be run by hand from the Actions tab.
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds `web/` and
  typechecks `worker/` on every push. The build deliberately runs with **no**
  Supabase credentials — needing them at build time is a bug.

> GitHub Pages cannot host this app: every route is server-rendered and it has
> API routes, so there is no static bundle to publish. The repo used to carry a
> Pages workflow that failed on every run; it has been removed.

---

## How ingestion works

Two paths into the same pipeline:

- **Live (`--recent`, every 15 min):** reads EDGAR's `getcurrent` Atom feed of the
  latest filings, so a trade lands in the DB minutes after it is published. The
  feed lists one entry per *party* (issuer + each reporting owner), so entries are
  deduped by accession number before anything is fetched.
- **Sweep (`--days N`, nightly):** walks the full `master.<date>.idx` daily index.
  The feed only reaches back ~100 entries per page, so this is the completeness
  backstop for anything a poll window missed.

Both then do the same thing:

1. Keep only Form 4 / 4/A rows.
2. Dedupe against the DB by `accession_no` (the global unique filing id).
3. Download each new filing's full submission `.txt`, extract the embedded
   ownership XML, and parse it defensively (every field optional).
4. Upsert issuer, insider, filing, and transaction rows. Idempotent — re-runs never
   create duplicates.
5. Log the run to `ingestion_runs` for debugging.

A single malformed filing is logged and skipped; it never aborts the batch.

## Notes / limits

- Stage 1 stores the **first reporting owner** per filing (multi-owner filings are
  simplified — addressed in Stage 2).
- Tickers come straight from the filing XML and may be missing; Stage 2 adds the
  official CIK↔ticker map.
- RLS is left off for Stage 1 (all data is public, read-only). Enable it in Stage 5.
