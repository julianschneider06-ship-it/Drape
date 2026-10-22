-- Dashboard views 2: settings, job queue, shop refresh status, likes by style. Read-only, security_invoker, no access for anon / authenticated (same pattern as dashboard_views).
create or replace view public.dash_settings with (security_invoker = true) as
select key, value, updated_at, updated_by from public.app_settings order by key;

create or replace view public.dash_job_requests with (security_invoker = true) as
select id, job, status, requested_at, requested_by, started_at, finished_at,
       round(extract(epoch from (coalesce(finished_at, now()) - started_at)))::int as seconds,
       attempts, result, error
  from public.job_requests
 order by id desc
 limit 20;

-- latest result per shop + consecutive failures: runs counted once (the last attempt of a job), failures since the last ok run
create or replace view public.dash_shop_refresh_status with (security_invoker = true) as
with runs as (
  select distinct on (shop, coalesce(job_id::text, run_at::date::text)) shop, run_at, status
    from public.shop_refresh_log
   order by shop, coalesce(job_id::text, run_at::date::text), attempt desc, id desc
), last_ok as (
  select shop, max(run_at) as at from runs where status = 'ok' group by shop
), fails as (
  select r.shop, count(*) as n from runs r left join last_ok l using (shop) where r.status <> 'ok' and r.run_at > coalesce(l.at, '-infinity'::timestamptz) group by r.shop
), latest as (
  select distinct on (shop) shop, run_at, attempt, status, http_code, products_seen, skipped_reason
    from public.shop_refresh_log order by shop, run_at desc, id desc
)
select l.shop, l.run_at as last_run_at, l.status, l.http_code, l.attempt, l.products_seen, l.skipped_reason,
       coalesce(f.n, 0) as consecutive_failures, o.at as last_ok_at
  from latest l left join fails f using (shop) left join last_ok o using (shop)
 order by consecutive_failures desc, l.shop;

-- likes per day and style (event log, last 14 days only: the created_at filter prunes the monthly partitions)
create or replace view public.dash_likes_by_style with (security_invoker = true) as
select e.created_at::date as day, coalesce(e.gender, 'unknown') as gender, coalesce(st.style, 'unclassified') as style,
       count(*) filter (where e.event_type = 'like') as likes, count(*) filter (where e.event_type = 'unlike') as unlikes
  from public.events e
  left join lateral (
    select (select k.key from jsonb_each_text(pc.attributes->'style_weights') k order by k.value::numeric desc limit 1) as style
      from public.product_classifications pc where pc.product_id = e.product_id and pc.valid order by pc.created_at desc limit 1
  ) st on true
 where e.event_type in ('like', 'unlike') and e.created_at >= (current_date - 13)
 group by 1, 2, 3
 order by 1 desc, 4 desc;

revoke all on public.dash_settings, public.dash_job_requests, public.dash_shop_refresh_status, public.dash_likes_by_style from anon, authenticated;
