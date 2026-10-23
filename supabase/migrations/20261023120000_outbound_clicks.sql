-- Outbound redirect /out/[productId]: per-shop affiliate switch, click log, two gateway functions, dashboard view. Insert/update only, nothing is deleted.
alter table public.sources add column if not exists affiliate_enabled boolean not null default false;

-- Click log: no IP, no user agent, no user or device id. Written only through click_log_add (server side).
create table if not exists public.click_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  product_id   bigint not null,
  shop         text not null,
  surface      text not null check (surface in ('feed','search','wishlist','detail','unknown')),
  feed_variant text check (feed_variant in ('base','dynamic','hybrid')),
  src          text,
  affiliate    boolean not null default false
);
create index if not exists click_log_created_idx on public.click_log (created_at);
alter table public.click_log enable row level security;
revoke all on public.click_log from anon, authenticated;

-- Resolve the target of a product. The deep link is only returned when the chosen shop has affiliate_enabled and a link row exists.
create or replace function public.out_resolve(p_product bigint) returns jsonb
language sql stable security definer set search_path = public as $f$
  select jsonb_build_object(
           'url', o.url, 'shop', s.slug, 'affiliate_enabled', s.affiliate_enabled,
           'aw_deep_link', case when s.affiliate_enabled then
              (select a.aw_deep_link from affiliate_links a where a.product_id = p.id and a.network = 'awin' order by a.updated_at desc limit 1) end)
    from products p
    join lateral (select * from offers o2 where o2.product_id = p.id order by (o2.availability = 'in_stock') desc, o2.price_cents nulls last limit 1) o on true
    join sources s on s.id = o.source_id
   where p.id = p_product and p.status = 'active' and s.active
$f$;
revoke all on function public.out_resolve(bigint) from public, anon, authenticated;
grant execute on function public.out_resolve(bigint) to service_role;

create or replace function public.click_log_add(p_product bigint, p_shop text, p_surface text, p_variant text, p_src text, p_affiliate boolean) returns void
language sql security definer set search_path = public as $f$
  insert into click_log (product_id, shop, surface, feed_variant, src, affiliate)
  values (p_product, p_shop, case when p_surface in ('feed','search','wishlist','detail') then p_surface else 'unknown' end,
          case when p_variant in ('base','dynamic','hybrid') then p_variant end, left(p_src, 32), coalesce(p_affiliate, false))
$f$;
revoke all on function public.click_log_add(bigint, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.click_log_add(bigint, text, text, text, text, boolean) to service_role;

insert into pipeline_rpc_allowlist (fn) select f from unnest(array['out_resolve','click_log_add']) f where not exists (select 1 from pipeline_rpc_allowlist where fn = f);
update pipeline_tokens set allowed_fns = allowed_fns || array['out_resolve','click_log_add'] where label = 'vercel-sample-page' and not ('out_resolve' = any (allowed_fns));

create or replace view public.dash_clicks_daily with (security_invoker = true) as
select created_at::date as day, shop, surface, count(*) as clicks, count(*) filter (where affiliate) as affiliate_clicks
  from public.click_log
 group by 1, 2, 3
 order by 1 desc, 2, 3;
revoke all on public.dash_clicks_daily from anon, authenticated;
