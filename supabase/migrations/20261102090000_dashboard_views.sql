-- Read-only status-dashboard views (dash_*). No tables or data are touched.
-- security_invoker: the view runs with the caller's rights, so it is only as readable as the tables below it.
-- Explicit revoke: no access for anon / authenticated (no new public access).

create or replace view public.dash_products_overview with (security_invoker = true) as
select coalesce(gender, 'unknown') as gender,
       count(*)                                             as total,
       count(*) filter (where feed_ready)                   as feed_ready,
       count(*) filter (where classified_at is null)        as unclassified,
       count(*) filter (where image_status = 'needs_image_work') as needs_image_work
  from public.products
 group by rollup (coalesce(gender, 'unknown'))
 order by 1 nulls last;

create or replace view public.dash_pool_overview with (security_invoker = true) as
select gender, style_key, count(*) as active_outfits
  from public.outfit_pool
 where active
 group by gender, style_key
 order by gender, active_outfits desc;

-- Last stock refresh per shop, taken from the offers. A skipped host (401/403/404/410/429/503) is only printed by
-- scripts/refresh-stock.ts and not stored, so the error part cannot be shown here.
create or replace view public.dash_stock_freshness with (security_invoker = true) as
select s.slug as shop,
       max(o.updated_at)   as last_offer_update,
       max(o.last_seen_at) as last_seen,
       count(distinct o.product_id) as products,
       count(*) filter (where o.availability = 'in_stock') as offers_in_stock
  from public.sources s
  join public.offers o on o.source_id = s.id
 group by s.slug
 order by last_seen nulls first;

-- AI spend from the cost_usd columns the batch scripts store. The run cap (DRAPE_RUN_CAP_USD) lives only in the script
-- environment and a temp ledger file, so the default of 10 is shown as a reference, not read from the real setting.
create or replace view public.dash_ai_spend with (security_invoker = true) as
with c as (
  select created_at::date as d, cost_usd from public.product_classifications
  union all select created_at::date, cost_usd from public.product_embeddings
  union all select created_at::date, cost_usd from public.product_image_checks
  union all select created_at::date, cost_usd from public.product_presentation_checks
)
select coalesce(to_char(d, 'YYYY-MM-DD'), 'TOTAL') as day,
       round(sum(cost_usd)::numeric, 4) as spend_usd,
       count(*) as paid_rows,
       case when d is null then 10 end as default_run_cap_usd
  from c
 group by rollup (d)
 order by 1 desc;

create or replace view public.dash_events_daily with (security_invoker = true) as
select created_at::date as day, event_type, count(*) as events
  from public.events
 where created_at >= (current_date - 13)
 group by 1, 2
 order by 1 desc, 3 desc;

create or replace view public.dash_supply_by_style with (security_invoker = true) as
select coalesce(p.gender, 'unknown') as gender, coalesce(st.style, 'unclassified') as style, count(*) as feed_ready_products
  from public.products p
  left join lateral (
    select (select e.key from jsonb_each_text(pc.attributes->'style_weights') e order by e.value::numeric desc limit 1) as style
      from public.product_classifications pc
     where pc.product_id = p.id and pc.valid
     order by pc.created_at desc limit 1
  ) st on true
 where p.feed_ready and p.status = 'active'
 group by 1, 2
 order by 1, 3;

revoke all on public.dash_products_overview, public.dash_pool_overview, public.dash_stock_freshness,
              public.dash_ai_spend, public.dash_events_daily, public.dash_supply_by_style from anon, authenticated;
