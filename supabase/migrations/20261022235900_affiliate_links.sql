-- Affiliate links (Awin). One row per imported product and merchant. Server-side only: RLS on, no policy, no grants to anon/authenticated.
-- aw_deep_link contains the publisher id and must never reach browser code or a public API response.
create table if not exists affiliate_links (
  product_id      bigint not null references products(id),
  network         text not null default 'awin',
  merchant        text not null,
  aw_deep_link    text not null,
  feed_product_id text,
  feed_price      numeric(12,2),
  feed_currency   char(3),
  feed_rrp        numeric(12,2),
  feed_in_stock   boolean,
  updated_at      timestamptz not null default now(),
  primary key (product_id, network, merchant)
);
alter table affiliate_links enable row level security;
revoke all on affiliate_links from anon, authenticated;

-- Gateway function (batch scripts only): items = [{source, external_id, merchant, aw_deep_link, feed_product_id, feed_price, feed_currency, feed_rrp, feed_in_stock}]
-- The product is found through the offer (source slug + external id). Insert or update only, nothing is deleted.
create or replace function affiliate_links_upsert(p_items jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with src as (
    select o.product_id, x.merchant, x.aw_deep_link, x.feed_product_id, x.feed_price, x.feed_currency, x.feed_rrp, x.feed_in_stock
    from jsonb_to_recordset(p_items) as x(source text, external_id text, merchant text, aw_deep_link text, feed_product_id text,
                                          feed_price numeric, feed_currency text, feed_rrp numeric, feed_in_stock boolean)
    join sources s on s.slug = x.source
    join offers o on o.source_id = s.id and o.external_id = x.external_id
    where x.aw_deep_link like 'https://www.awin1.com/%'),
  up as (
    insert into affiliate_links (product_id, network, merchant, aw_deep_link, feed_product_id, feed_price, feed_currency, feed_rrp, feed_in_stock)
    select distinct on (product_id, merchant) product_id, 'awin', merchant, aw_deep_link, feed_product_id, feed_price, feed_currency, feed_rrp, feed_in_stock from src
    on conflict (product_id, network, merchant) do update set aw_deep_link = excluded.aw_deep_link, feed_product_id = excluded.feed_product_id,
      feed_price = excluded.feed_price, feed_currency = excluded.feed_currency, feed_rrp = excluded.feed_rrp, feed_in_stock = excluded.feed_in_stock, updated_at = now()
    returning 1)
  select count(*) into v_n from up;
  return v_n;
end $$;
revoke all on function affiliate_links_upsert(jsonb) from public, anon, authenticated;

insert into pipeline_rpc_allowlist(fn) values ('affiliate_links_upsert') on conflict do nothing;
