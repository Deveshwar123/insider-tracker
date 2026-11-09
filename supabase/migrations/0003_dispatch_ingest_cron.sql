-- 0003: start ingestion from Supabase on time, instead of trusting GitHub's cron (IT-14)
--
-- GitHub's `schedule` event is best-effort. On this repo it fired ~37 of the 96
-- daily polls while the repo was active, and ~7 a day once it went quiet, so new
-- trades showed up hours late. Here the database itself calls the Ingest
-- workflow's workflow_dispatch API on a fixed schedule (pg_cron + pg_net).
-- GitHub's own schedules stay in ingest.yml as a backup trigger.
--
-- BEFORE RUNNING THIS, store a GitHub token in Supabase Vault:
--   * Token: fine-grained personal access token, "Only select repositories" →
--     this repo, Repository permissions → Actions: Read and write. Nothing else.
--   * Vault: Dashboard → Integrations → Vault → Add new secret,
--     name `github_dispatch_token`.
-- The token never appears in this file, in cron.job, or anywhere the API exposes.
--
-- Forked the repo? Change OWNER/REPO in the URL inside private.dispatch_ingest().
--
-- Check it's working:
--   select jobname, schedule, active from cron.job;
--   select status, start_time, return_message from cron.job_run_details order by start_time desc limit 5;
--   select status_code, created, content from net._http_response order by created desc limit 5;  -- 204 = run started
-- Turn it off:  select cron.unschedule('ingest-live-poll'); select cron.unschedule('ingest-nightly-sweep');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- A schema the Data API does not expose. A function in `public` would be callable
-- by anyone holding the publishable key (POST /rest/v1/rpc/...).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_ingest(mode text, days int default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  inputs jsonb := jsonb_build_object('mode', mode);
begin
  select decrypted_secret into token
    from vault.decrypted_secrets
   where name = 'github_dispatch_token';
  if token is null then
    raise exception 'Vault secret github_dispatch_token is missing; see 0003_dispatch_ingest_cron.sql';
  end if;

  -- workflow_dispatch inputs are strings.
  if days is not null then
    inputs := inputs || jsonb_build_object('days', days::text);
  end if;

  -- Async: returns the pg_net request id; the response lands in net._http_response.
  return net.http_post(
    url := 'https://api.github.com/repos/Deveshwar123/insider-tracker/actions/workflows/ingest.yml/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', inputs),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'insider-tracker-pg-cron',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.dispatch_ingest(text, int) from public, anon, authenticated;

-- pg_cron runs in UTC. Re-running this file replaces jobs of the same name.
-- Live poll: every 15 minutes, Monday–Friday.
select cron.schedule('ingest-live-poll', '*/15 * * * 1-5', $job$select private.dispatch_ingest('recent')$job$);
-- Nightly sweep of the last 4 completed days (also runs the workflow's keepalive job).
select cron.schedule('ingest-nightly-sweep', '10 23 * * 1-5', $job$select private.dispatch_ingest('days', 4)$job$);
