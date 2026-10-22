-- dash_shop_refresh_status: adds the market used on the last run, the configured market, and whether the shop is frozen (and why). Read-only, security_invoker, closed to the public.
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
  select distinct on (shop) shop, run_at, attempt, status, http_code, products_seen, skipped_reason, market
    from public.shop_refresh_log order by shop, run_at desc, id desc
)
select l.shop, l.run_at as last_run_at, l.status, l.http_code, l.attempt, l.products_seen, l.skipped_reason,
       coalesce(f.n, 0) as consecutive_failures, o.at as last_ok_at,
       coalesce(l.market, 'US') as market_used, m.country as market_configured, coalesce(m.frozen, false) as frozen, m.reason as frozen_reason, m.currency as currency_override
  from latest l left join fails f using (shop) left join last_ok o using (shop) left join public.shop_market m on m.shop = l.shop
 order by consecutive_failures desc, l.shop;
revoke all on public.dash_shop_refresh_status from anon, authenticated;
