-- Job queue + daily stock refresh + per-shop refresh log.
-- Flow: pg_cron enqueues one refresh_stock job per day (01:15 UTC = 02:15/03:15 in Europe) -> pg_cron "tick" every 5 minutes calls the runner route on Vercel
-- while a job is open -> the route claims the job (one running job at a time, lease), works for up to about 4 minutes, saves its progress and ends;
-- the next tick continues (resumable) until the job is done. The route authenticates with a secret that only exists in Supabase Vault (generated here, never shown).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.job_requests (
  id bigint generated always as identity primary key,
  job text not null check (job in ('refresh_stock')),                 -- allowlist of jobs; never add a job that makes paid AI calls
  status text not null default 'requested' check (status in ('requested', 'running', 'done', 'failed')),
  requested_at timestamptz not null default now(),
  requested_by text,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error text,
  progress jsonb not null default '{}'::jsonb,                        -- runner state between invocations (phase, shops done, retry list)
  lease_until timestamptz,                                            -- a running job may be claimed again only after this time
  heartbeat_at timestamptz,
  attempts integer not null default 0
);
create unique index job_requests_one_running on public.job_requests ((true)) where status = 'running';
create index job_requests_open_idx on public.job_requests (requested_at) where status in ('requested', 'running');
alter table public.job_requests enable row level security;
revoke all on public.job_requests from anon, authenticated;

create table public.shop_refresh_log (
  id bigint generated always as identity primary key,
  shop text not null,
  run_at timestamptz not null default now(),
  job_id bigint references public.job_requests (id),
  attempt smallint not null default 1,                                -- 2 = the slow retry after a 429
  status text not null check (status in ('ok', 'skipped', 'error')),
  http_code integer,
  products_seen integer,
  skipped_reason text
);
create index shop_refresh_log_shop_idx on public.shop_refresh_log (shop, run_at desc);
create index shop_refresh_log_run_idx on public.shop_refresh_log (run_at);
alter table public.shop_refresh_log enable row level security;
revoke all on public.shop_refresh_log from anon, authenticated;

-- one open refresh_stock job at a time; the daily enqueue skips when one ran or is open in the last 20 hours
create or replace function public.job_request(p_job text, p_by text default null) returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  select id into v from job_requests where job = p_job and status in ('requested', 'running') order by id limit 1;
  if v is not null then return v; end if;
  insert into job_requests (job, requested_by) values (p_job, p_by) returning id into v;
  return v;
end $$;

create or replace function public.job_enqueue_daily() returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if exists (select 1 from job_requests where job = 'refresh_stock' and (status in ('requested', 'running') or requested_at > now() - interval '20 hours')) then return null; end if;
  insert into job_requests (job, requested_by) values ('refresh_stock', 'cron') returning id into v;
  return v;
end $$;

-- claim: never two running at once (unique index + live-lease check); a running job whose lease ran out is taken over (resume); gives up after 40 claims
create or replace function public.job_claim(p_lease_s integer default 420) returns jsonb language plpgsql security definer set search_path = public as $$
declare r job_requests;
begin
  if exists (select 1 from job_requests where status = 'running' and lease_until >= now()) then return null; end if;
  update job_requests set status = 'failed', finished_at = now(), error = 'gave up after 40 runner invocations', lease_until = null
   where status = 'running' and lease_until < now() and attempts >= 40;
  select * into r from job_requests where status = 'requested' or (status = 'running' and lease_until < now()) order by requested_at, id limit 1 for update skip locked;
  if not found then return null; end if;
  update job_requests set status = 'running', started_at = coalesce(started_at, now()), heartbeat_at = now(), lease_until = now() + make_interval(secs => p_lease_s), attempts = attempts + 1
   where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'job', r.job, 'progress', r.progress, 'attempts', r.attempts);
end $$;

-- save progress; p_lease_s = how long until the next invocation may claim the job again (0 = right away, larger = "not before", used for the slow 429 retry)
create or replace function public.job_progress(p_id bigint, p_progress jsonb, p_lease_s integer default 0) returns void language sql security definer set search_path = public as $$
  update job_requests set progress = p_progress, heartbeat_at = now(), lease_until = now() + make_interval(secs => p_lease_s) where id = p_id and status = 'running';
$$;

create or replace function public.job_finish(p_id bigint, p_status text, p_result jsonb, p_error text default null) returns void language sql security definer set search_path = public as $$
  update job_requests set status = case when p_status = 'failed' then 'failed' else 'done' end, finished_at = now(), result = p_result, error = left(p_error, 500), lease_until = null
   where id = p_id and status = 'running';
$$;

create or replace function public.shop_log_add(p_rows jsonb) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into shop_refresh_log (shop, job_id, attempt, status, http_code, products_seen, skipped_reason)
  select x.shop, x.job_id, coalesce(x.attempt, 1), x.status, x.http_code, x.products_seen, left(x.skipped_reason, 200)
    from jsonb_to_recordset(p_rows) as x(shop text, job_id bigint, attempt smallint, status text, http_code integer, products_seen integer, skipped_reason text);
  get diagnostics n = row_count;
  return n;
end $$;

-- runner secret: generated inside the database, stored in Vault, never printed. The route sends it back in a header; this function compares it.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'runner_secret', 'authenticates the job runner route')
 where not exists (select 1 from vault.secrets where name = 'runner_secret');

-- a runner token for ONE invocation: valid 1 hour (never longer than 24 h), only the functions a refresh needs. Plaintext is returned once and kept in memory.
create or replace function public.runner_mint_token(p_secret text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare s text; t text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'runner_secret';
  if s is null or p_secret is null or p_secret <> s then raise exception 'forbidden'; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into pipeline_tokens (token_hash, label, allowed_fns, expires_at)
  values (encode(digest(t, 'sha256'), 'hex'), 'runner-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'),
          array['source_upsert', 'offers_refresh', 'shop_log_add', 'job_claim', 'job_progress', 'job_finish', 'outfit_inputs', 'composer_inputs', 'acc_inputs', 'snapshot_put'],
          now() + interval '1 hour');
  return t;
end $$;

-- pg_cron tick: if a job is open (requested, or running with an expired lease), poke the runner route. The route answers at once and works in the background.
create or replace function public.runner_tick() returns void language plpgsql security definer set search_path = public as $$
declare s text;
begin
  if not exists (select 1 from job_requests where status = 'requested' or (status = 'running' and lease_until < now())) then return; end if;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'runner_secret';
  perform net.http_post(url := 'https://drape-julian-schneider.vercel.app/api/jobs/run', body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-runner-secret', s), timeout_milliseconds := 10000);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['job_request(text,text)', 'job_enqueue_daily()', 'job_claim(integer)', 'job_progress(bigint,jsonb,integer)', 'job_finish(bigint,text,jsonb,text)',
    'shop_log_add(jsonb)', 'runner_mint_token(text)', 'runner_tick()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

insert into public.pipeline_rpc_allowlist (fn) values ('job_request'), ('job_claim'), ('job_progress'), ('job_finish'), ('shop_log_add'), ('runner_mint_token')
on conflict do nothing;
-- the web token may only ask for a runner token (and needs the runner secret for it)
update public.pipeline_tokens set allowed_fns = allowed_fns || array['runner_mint_token']
 where label = 'vercel-sample-page' and not ('runner_mint_token' = any (allowed_fns));
-- the stock-refresh tokens (batch scripts) may also write the shop log
update public.pipeline_tokens set allowed_fns = allowed_fns || array['shop_log_add'] where label = 'batch-2026-10-21-stock-refresh' and not ('shop_log_add' = any (allowed_fns));

select cron.schedule('drape-enqueue-daily-refresh', '15 1 * * *', 'select public.job_enqueue_daily()');
select cron.schedule('drape-job-runner-tick', '*/5 * * * *', 'select public.runner_tick()');
