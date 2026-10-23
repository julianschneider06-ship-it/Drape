-- Brand popularity (per gender): aggregates only, recomputed daily from the event log and click_log. No device ids in any table or view here.
-- Attribution rules (also in docs/architecture.md "Brand popularity"):
--   impression / scroll_past : product_ids = the outfit's main pieces (accessories are not in these events) -> one count per piece, brand of that piece
--   tap_product              : product_id (piece or accessory)
--   like / unlike            : product_id; unlike = -1, so likes = max(0, likes - unlikes) per brand and gender
--   outbound_clicks          : click_log.product_id; a unisex product counts for both genders (click_log has no gender)
--   gender                   : events.gender (feed direction; unisex products count for the feed they were shown in); only when it is missing the product's own
--                              gender is used if it is men / women, otherwise the event is skipped
--   not used                 : dwell_ms, swap, outfit_up / down / clear, view_product_click (the real click is in click_log), search_*
-- Devices listed in app_settings.popularity_exclude_devices (JSON array of uuids, default []) are left out inside the function.
create table if not exists public.brand_popularity (
  gender          text   not null check (gender in ('men', 'women')),
  brand_norm      text   not null,
  impressions     bigint not null default 0,
  likes           bigint not null default 0,
  taps            bigint not null default 0,
  outbound_clicks bigint not null default 0,
  scroll_pasts    bigint not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (gender, brand_norm)
);
alter table public.brand_popularity enable row level security;
revoke all on public.brand_popularity from anon, authenticated;

insert into public.app_settings (key, value, updated_by) values
  ('brand_boost_enabled', 'true', 'migration'),             -- allowed: true | false (live composer brand factor)
  ('popularity_exclude_devices', '[]', 'migration')         -- JSON array of device ids to leave out of the counts (test devices); never sent to the web app
on conflict (key) do nothing;

-- the web app reads settings through this function: the exclusion list (device ids) must not travel with it
create or replace function public.settings_get() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings where key <> 'popularity_exclude_devices';
$$;

create or replace function public.refresh_brand_popularity() returns jsonb language plpgsql security definer set search_path = public as $$
declare excl uuid[]; n int;
begin
  select coalesce(array_agg(x::uuid), '{}'::uuid[]) into excl
    from public.app_settings s
   cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) x
   where s.key = 'popularity_exclude_devices' and x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  create temp table _bp on commit drop as
  with src as (
    select e.event_type as t, e.gender as eg, pid as product_id, 1 as w
      from public.events e cross join lateral unnest(e.product_ids) pid
     where e.event_type in ('impression', 'scroll_past') and e.device_id <> all (excl)
    union all
    select e.event_type, e.gender, e.product_id, case when e.event_type = 'unlike' then -1 else 1 end
      from public.events e
     where e.event_type in ('like', 'unlike', 'tap_product') and e.product_id is not null and e.device_id <> all (excl)
  ), ev as (
    select s.t, coalesce(s.eg, case when p.gender in ('men', 'women') then p.gender end) as gender, p.brand_norm, s.w
      from src s join public.products p on p.id = s.product_id
  ), ck as (
    select 'click'::text as t, g as gender, p.brand_norm, 1 as w
      from public.click_log c join public.products p on p.id = c.product_id
     cross join lateral unnest(case when p.gender in ('men', 'women') then array[p.gender] else array['men', 'women'] end) g
  ), allr as (
    select * from ev where gender in ('men', 'women') union all select * from ck
  )
  select gender, brand_norm,
         coalesce(sum(w) filter (where t = 'impression'), 0)::bigint          as impressions,
         greatest(coalesce(sum(w) filter (where t in ('like', 'unlike')), 0), 0)::bigint as likes,
         coalesce(sum(w) filter (where t = 'tap_product'), 0)::bigint         as taps,
         coalesce(sum(w) filter (where t = 'click'), 0)::bigint               as outbound_clicks,
         coalesce(sum(w) filter (where t = 'scroll_past'), 0)::bigint         as scroll_pasts
    from allr group by gender, brand_norm;

  insert into public.brand_popularity as bp (gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts, updated_at)
  select gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts, now() from _bp
  on conflict (gender, brand_norm) do update
    set impressions = excluded.impressions, likes = excluded.likes, taps = excluded.taps, outbound_clicks = excluded.outbound_clicks, scroll_pasts = excluded.scroll_pasts, updated_at = now();
  get diagnostics n = row_count;

  -- brands that no longer have any counted event (e.g. after the exclusion list changed): reset to zero (no deletes)
  update public.brand_popularity b set impressions = 0, likes = 0, taps = 0, outbound_clicks = 0, scroll_pasts = 0, updated_at = now()
   where not exists (select 1 from _bp x where x.gender = b.gender and x.brand_norm = b.brand_norm)
     and (b.impressions <> 0 or b.likes <> 0 or b.taps <> 0 or b.outbound_clicks <> 0 or b.scroll_pasts <> 0);
  return jsonb_build_object('rows', n, 'excluded_devices', cardinality(excl));
end $$;
revoke all on function public.refresh_brand_popularity() from public, anon, authenticated;
grant execute on function public.refresh_brand_popularity() to service_role;

-- compact read for the web app (cached together with the catalogue snapshot): [[gender, brand, impressions, likes, taps, clicks, scroll_pasts], ...]
create or replace function public.brand_popularity_get() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('updated_at', (select max(updated_at) from public.brand_popularity),
    'rows', coalesce((select jsonb_agg(jsonb_build_array(gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts)) from public.brand_popularity where impressions > 0), '[]'::jsonb));
$$;
revoke all on function public.brand_popularity_get() from public, anon, authenticated;
grant execute on function public.brand_popularity_get() to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('brand_popularity_get') on conflict do nothing;
update public.pipeline_tokens set allowed_fns = allowed_fns || array['brand_popularity_get']
 where label like 'vercel%' and not ('brand_popularity_get' = any (allowed_fns));

select cron.schedule('drape-refresh-brand-popularity', '45 1 * * *', 'select public.refresh_brand_popularity()');

-- dashboard: score = weighted signal / impressions; factor mirrors src/config/popularity.ts (a test keeps the constants in sync): shrink toward the gender average,
-- neutral below 300 impressions, clamp 0.85 .. 1.30
create or replace view public.dash_brand_popularity with (security_invoker = true) as
with b as (
  select *, likes * 1.0 + taps * 0.3 + outbound_clicks * 2.0 - scroll_pasts * 0.005 as signal from public.brand_popularity where impressions > 0
), a as (
  select b.*, sum(signal) over (partition by gender) / nullif(sum(impressions) over (partition by gender), 0) as avg_rate from b
)
select gender, brand_norm, impressions, likes, taps, outbound_clicks, scroll_pasts,
       round(likes::numeric / impressions, 4) as like_rate,
       round((signal / impressions)::numeric, 5) as score,
       round((case when impressions < 300 or avg_rate is null or avg_rate <= 0 then 1.0
              else least(1.30, greatest(0.85, 1 + 0.5 * (((signal + 200 * avg_rate) / (impressions + 200)) / avg_rate - 1))) end)::numeric, 3) as factor
  from a
 order by gender, factor desc, score desc;
revoke all on public.dash_brand_popularity from anon, authenticated;
