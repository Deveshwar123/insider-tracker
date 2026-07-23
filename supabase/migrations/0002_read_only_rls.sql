-- ============================================================================
-- Make the public key read-only.
--
-- WHY THIS MATTERS
-- The web app now runs in the browser with your publishable ("anon") key, which
-- is public by design — anyone who opens the app can read it out of the page.
-- That is fine for READS: this is public SEC data.
--
-- It is NOT fine without RLS. With row-level security disabled, PostgREST lets
-- the anon role INSERT, UPDATE and DELETE, so anyone holding that public key
-- could wipe your filings. Verified on a live project: an insert attempt with
-- the publishable key returned 400 (bad payload) rather than 401/403 — i.e. it
-- was accepted as authorised.
--
-- This migration enables RLS and grants SELECT only. The worker is unaffected:
-- it uses the service_role key, which bypasses RLS entirely.
--
-- AFTER RUNNING THIS, the worker must use the service_role / secret key.
-- A worker/.env still holding the publishable key will start failing writes.
--
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table issuers        enable row level security;
alter table insiders       enable row level security;
alter table filings        enable row level security;
alter table transactions   enable row level security;
alter table ingestion_runs enable row level security;

-- Public read. No insert/update/delete policies exist, and with RLS on, "no
-- policy" means "denied" — so the anon key can only ever SELECT.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'issuers' and policyname = 'public_read_issuers') then
    create policy public_read_issuers on issuers for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'insiders' and policyname = 'public_read_insiders') then
    create policy public_read_insiders on insiders for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'filings' and policyname = 'public_read_filings') then
    create policy public_read_filings on filings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'transactions' and policyname = 'public_read_transactions') then
    create policy public_read_transactions on transactions for select using (true);
  end if;
end $$;

-- ingestion_runs is operational logging, not part of the dashboard: no read
-- policy, so the public key cannot see it at all. The worker still writes it
-- via service_role.
