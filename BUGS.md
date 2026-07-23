# Insider Tracker — Bug Log

Every bug gets a ticket here: opened when found, closed when fixed and verified,
always with the commit that fixed it. Newest first.

Status: `OPEN` · `IN PROGRESS` · `CLOSED`

---

## IT-9 — The publishable key can write to the database

| | |
|---|---|
| **Status** | OPEN — needs a migration run against the live project |
| **Opened** | 2026-07-23 |
| **Severity** | High — public key with write access to all data |
| **Files** | `supabase/migrations/0002_read_only_rls.sql` |

**Finding**

RLS was never enabled (Stage 1 deliberately deferred it). With RLS off,
PostgREST allows the anon/publishable role to INSERT, UPDATE and DELETE. Probed
on the live project with a deliberately invalid payload: the response was `400`
(bad column) rather than `401`/`403` — the request was *authorised*, only
malformed.

This was survivable while the key only existed server-side. It is not, now that
the app runs in the browser and the key is published to every visitor: anyone
could delete every filing.

**Fix** — `0002_read_only_rls.sql` enables RLS on all five tables and grants
`select` only. The worker is unaffected (service_role bypasses RLS).

**Action required:** run the migration in the Supabase SQL editor, then make
sure `worker/.env` uses the **service_role** key — a worker still holding the
publishable key will stop being able to write.

---

## IT-8 — The worker could never read its own .env file

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | High — `npm run ingest` was impossible to run locally |
| **Files** | `worker/src/index.ts`, `worker/src/env.ts` |

**Actual**

```
$ npm run ingest
Error: Missing required env var: SUPABASE_URL.
```
…with a fully populated `worker/.env` sitting right there.

**Root cause**

`loadDotEnv()` was called inside `main()`. ES modules evaluate every static
import *before* the importing module's body runs, so by the time `main()` was
reached, `./ingest/run.js` → `./db/supabase.js` → `./config.js` had already run
its `required()` checks against an empty `process.env` and thrown.

It only ever worked in CI, where the variables come from repo secrets and are
already in the environment — so the documented local workflow in the README had
never actually worked.

**Fix** — the loader moved to `src/env.ts`, which runs on import, and
`index.ts` imports it first for its side effect. Real environment variables
still win over the file, so CI behaviour is unchanged. Verified: a local
`npm run ingest:recent` wrote 49 filings.

---

## IT-7 — Ingestion reported success while ingesting nothing for a month

| | |
|---|---|
| **Status** | CLOSED (detection); ROOT CAUSE is environmental |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | Critical — the dashboard silently served month-old data |
| **Files** | `worker/src/edgar/index-fetcher.ts`, `worker/src/edgar/client.ts` |
| **Fixed in** | `7fa2dd8` |

**Symptom**

The dashboard's newest filing was **2026-06-26**, 27 days stale, even though the
scheduled ingest had reported *success* on Jul 13, 14, 15, 16, 17, 20, 21 and 22.

`ingestion_runs` told the story — every run:

```
filings_seen: 0, filings_new: 0, errors: 0, status: "success"
```

**Root cause** — a timing bug, hidden by a swallowed error

Two faults compounding:

1. **The job asked for a day EDGAR hadn't published yet.** `runIngestion(1)`
   ingested *today*, and the cron runs at 23:00 UTC — but EDGAR publishes
   `master.<date>.idx` hours after the day closes. Today's index simply does not
   exist at 23:00 UTC.
2. **The failure was invisible.** `fetchForm4Index()` treated *any* fetch error
   as "likely weekend/holiday" and returned `[]`. Zero entries meant nothing to
   process, so the run finished and logged itself `success`.

A missing archive file does not return 404. EDGAR serves the archive from S3
without list permission, so a file that isn't there comes back as **403
AccessDenied** — which is why this looked like a block. Confirmed live:
`master.20260723.idx` (today) → 403, `master.20260722.idx` (yesterday) → 200
with 560 Form 4 rows.

**Correction:** an earlier version of this ticket blamed SEC blocking datacenter
IPs. That was wrong — the same 403 appears from a laptop, because the file
genuinely isn't published yet.

**Fix**

- `edgarFetch` attaches the HTTP `status` to the error it throws.
- `fetchForm4Index` treats **403 and 404** as "no index published for this date"
  (403 is S3's not-found), and rethrows anything else.
- `runIngestion` now sweeps the last N **completed** days, ending *yesterday*.
  Today is covered by the live feed (`--recent`), which reads a different
  endpoint that is current within minutes.
- Because 403 is ambiguous, a run where **no** day yielded a single filing is
  now marked `failed`, not `success`. Silence was the actual defect.

---

## IT-1 — `next build` fails: dead Prisma import

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | Critical — nothing could be built or deployed |
| **Files** | `web/lib/prisma.ts` |
| **Fixed in** | `9b2fd85` |

**Actual:** `Type error: Cannot find module './generated/prisma'` — the build
stopped before producing anything.

**Root cause**

`web/prisma/schema.prisma` generates its client to `../lib/generated/prisma`,
which is never generated (no `prisma generate` step, and no `DATABASE_URL` is
configured anywhere). `lib/prisma.ts` imported from that path, and Next
typechecks every file in the project, not just the reachable ones.

Nothing imported `lib/prisma.ts` — the app reads exclusively through
`@supabase/supabase-js`. It was dead code that broke the build.

**Fix** — deleted `lib/prisma.ts`. `prisma/schema.prisma` stays as documentation
of the table shapes.

---

## IT-2 — GitHub Pages workflow failed on every single run

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | High — a red X on every push, and no CI actually checking the build |
| **Files** | `.github/workflows/nextjs.yml` → `.github/workflows/ci.yml` |
| **Fixed in** | `9b2fd85` |

**Actual:** every run failed at step 3, "Detect package manager".

**Root cause**

Two independent problems:

1. The workflow looked for `package.json` at the repo root. There isn't one — the
   app lives in `web/` — so the detect step hit its `exit 1` branch immediately.
2. Even if that were fixed it could not work. The step uploads `./out`, which
   only exists for a static export. Every route in this app is server-rendered
   (`ƒ` in the build output) and there are two API routes, so `next build` never
   produces `out/`.

Because nothing else ran `next build` in CI, IT-1 sat on `main` undetected.

**Fix** — removed the Pages workflow (Pages cannot host this app; Vercel is the
documented target) and replaced it with `ci.yml`, which builds `web/` and
typechecks `worker/` on every push and PR.

---

## IT-3 — "Refresh from SEC EDGAR" could loop forever

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | High — unbounded request loop against SEC, from the user's browser |
| **Files** | `web/app/components/RefreshButton.tsx` |
| **Fixed in** | `9b2fd85` |

**Steps to reproduce:** click Refresh on a day where more than 50 filings fail to
parse (a malformed batch, or an EDGAR block mid-run).

**Root cause**

Each `/api/refresh` call processes at most `CAP = 50` new filings and reports
`remaining`, so the button looped `while (true)` until `remaining === 0`. But a
filing that throws is never written to the DB, so the next call re-reads it as
"new" and it stays in `remaining` forever. With more than `CAP` permanently
failing filings, `remaining` never decreases and the loop never ends — it just
keeps calling EDGAR.

**Fix** — bounded loop: stop when a round adds nothing (`new === 0` while
`remaining > 0`), and cap at 40 rounds regardless. Both endings are reported in
the status line rather than looking like success.

---

## IT-4 — A completely failed refresh reported "Up to date"

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | Medium — a broken ingest is indistinguishable from a quiet day |
| **Files** | `web/lib/ingest.ts`, `web/app/components/RefreshButton.tsx` |
| **Fixed in** | `9b2fd85` |

**Root cause**

`refreshLatest()` wrapped each filing in `try { … } catch { }` with an empty
handler and returned only `new`/`processed`/`remaining`. If every filing failed —
wrong service-role key, EDGAR blocking the user agent, a schema mismatch — the
call still returned `{ new: 0 }` and the UI said *"Up to date — no new filings."*

`saveFiling()` also ignored the return of the issuer and insider upserts, so a
failure there surfaced later as an opaque foreign-key violation on `filings`.

**Fix** — `RefreshResult` now carries `errors` and `firstError`; the button
appends e.g. *"12 filing(s) could not be read (EDGAR 403 for …)"*. Issuer and
insider upsert errors are now thrown with the CIK in the message.

---

## IT-5 — Price cells stuck on the loading skeleton forever

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | Low — cosmetic, but reads as a hung page |
| **Files** | `web/app/components/FilingsExplorer.tsx` |
| **Fixed in** | `9b2fd85` |

**Root cause**

The Current-price column distinguishes three states by value: `undefined` = still
loading, `null` = no quote, number = a price. Tickers were only ever written on
success — a `/api/quotes` chunk that threw (or returned non-OK) left its 40
tickers `undefined`, so those cells animated a skeleton indefinitely.

**Fix** — a failed chunk now writes `null` for every ticker it covered, so the
cells settle on "—". Non-OK responses are treated as failures too, instead of
being parsed as JSON.

---

## IT-6 — `next build` required Supabase credentials

| | |
|---|---|
| **Status** | CLOSED |
| **Opened** | 2026-07-23 |
| **Closed** | 2026-07-23 |
| **Severity** | Medium — blocks CI and any fresh clone |
| **Files** | `web/lib/supabase.ts`, `web/lib/queries.ts` |
| **Fixed in** | `9b2fd85` |

**Root cause**

`lib/supabase.ts` threw at module scope when `NEXT_PUBLIC_SUPABASE_URL` /
`..._ANON_KEY` were unset. Since the module is imported by every page, `next
build` failed outright without a `.env.local` — even though the build never
queries the database. It only passed locally because a placeholder `.env.local`
happened to exist.

**Fix** — the client is created lazily by `getSupabase()`. A missing config now
fails at request time with the same clear message, and the build is
credential-free (which `ci.yml` enforces by building with no env set).

---

## Open tickets

_None._
