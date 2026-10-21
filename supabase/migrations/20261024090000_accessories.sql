-- Accessories: classification (taxonomy acc1) fields on products, new feed_slot 'accessory', work-list / store functions,
-- and the per-outfit accessory cache (outfit_accessories) with its build functions. v2 classification rows are untouched.

alter table public.products drop constraint products_feed_slot_check;
alter table public.products add constraint products_feed_slot_check check (feed_slot in ('top', 'bottom', 'shoes', 'full_body', 'accessory', 'none'));

alter table public.products
  add column accessory_type text,         -- cap | hat | beanie | scarf | bag | backpack | belt | necklace | bracelet | earrings | ring | watch | sunglasses | gloves | tie | other_wearable | not_fashion | excluded_for_now
  add column size_class text check (size_class in ('small', 'medium', 'large')),
  add column front_flat boolean,          -- clearly frontal, flat and symmetric: usable inline (sunglasses, necklace, belt)
  add column belt_shape text,             -- belts: straight_strip | coiled | other
  add column acc_tax text;                -- taxonomy version of the accessory classification
create index products_accessory_idx on public.products (accessory_type, id) where feed_slot = 'accessory';

-- Obvious non-outfit accessories are parked without an AI call (socks, underwear).
create function public.acc_prefilter() returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update products set feed_slot = 'none', accessory_type = 'excluded_for_now', acc_tax = 'prefilter'
   where category = 'accessories' and status = 'active' and accessory_type is null
     and (coalesce(subcategory, '') || ' ' || name) ~* '\m(socks?|sock|underwear|boxers?|briefs?|bras?|lingerie|tights|stockings)\M';
  get diagnostics n = row_count;
  return n;
end $$;

-- Work list: accessory products (category accessories, not parked) that have a pre-selected image and no classification for p_tax yet.
create function public.acc_todo(p_after bigint, p_limit integer, p_tax text)
returns table (id bigint, brand text, name text, subcategory text, images jsonb) language sql stable set search_path = public as $$
  select p.id, p.brand, p.name, p.subcategory,
         (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'rank', i.feed_rank) order by i.feed_rank), '[]'::jsonb)
            from product_images i where i.product_id = p.id and i.feed_rank <= 2)
    from products p
   where p.status = 'active' and p.category = 'accessories' and p.id > p_after and p.accessory_type is null
     and exists (select 1 from product_images i where i.product_id = p.id and i.selected)
     and not exists (select 1 from product_classifications c where c.product_id = p.id and c.taxonomy_version = p_tax)
   order by p.id limit least(p_limit, 500);
$$;

-- Store a batch of accessory classifications and update the product's accessory fields / feed slot / feed readiness.
-- item: {id, model, model_version, attributes, valid, usage, cost, latency_ms, source_image_url, input_hash, tax}
create function public.acc_store(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into product_classifications (product_id, taxonomy_version, model, model_version, attributes, confidence, valid, usage, cost_usd, latency_ms, source_image_url, input_hash)
  select i.id, i.tax, i.model, i.model_version, i.attributes, (i.attributes->>'confidence')::real, i.valid, i.usage, i.cost, i.latency_ms, i.source_image_url, i.input_hash
    from jsonb_to_recordset(p_items) as i(id bigint, tax text, model text, model_version text, attributes jsonb, valid boolean, usage jsonb, cost numeric, latency_ms integer, source_image_url text, input_hash text)
   where i.valid
  on conflict (product_id, taxonomy_version, model) do update
    set attributes = excluded.attributes, confidence = excluded.confidence, valid = excluded.valid, usage = excluded.usage, cost_usd = excluded.cost_usd,
        latency_ms = excluded.latency_ms, source_image_url = excluded.source_image_url, input_hash = excluded.input_hash, created_at = now();
  update products p set
      accessory_type = i.attributes->>'accessory_type',
      size_class = i.attributes->>'size_class',
      front_flat = (i.attributes->>'front_flat')::boolean,
      belt_shape = i.attributes->>'belt_shape',
      acc_tax = i.tax,
      feed_slot = case when i.attributes->>'accessory_type' in ('not_fashion', 'excluded_for_now') then 'none' else 'accessory' end,
      -- feed readiness: no person/mannequin and a usable image; the cutout + image check are the real gates after this
      feed_ready = (i.attributes->>'accessory_type' not in ('not_fashion', 'excluded_for_now'))
                   and not (i.attributes->>'has_model')::boolean and (i.attributes->>'feed_suitability')::real >= 0.6,
      image_status = case when (i.attributes->>'accessory_type' in ('not_fashion', 'excluded_for_now')) then p.image_status
                          when (i.attributes->>'has_model')::boolean then 'needs_image_work'
                          when (i.attributes->>'feed_suitability')::real >= 0.6 then 'feed_ready' else 'needs_image_work' end,
      image_reason = case when (i.attributes->>'accessory_type' in ('not_fashion', 'excluded_for_now')) then p.image_reason
                          when (i.attributes->>'has_model')::boolean then 'has_model'
                          when (i.attributes->>'feed_suitability')::real >= 0.6 then null else 'low_suitability' end,
      feed_image_url = coalesce((select im.url from product_images im where im.product_id = p.id and im.selected limit 1), p.feed_image_url),
      classified_at = now()
    from jsonb_to_recordset(p_items) as i(id bigint, tax text, attributes jsonb, valid boolean)
   where p.id = i.id and i.valid;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.acc_cost(p_tax text) returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from product_classifications where taxonomy_version = p_tax;
$$;

-- Counts for reports: per accessory_type and gate (eligible = cutout ok + single product, in stock).
create function public.acc_stats() returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb) from (
    select coalesce(accessory_type, 'unclassified') accessory_type, count(*) total,
           count(*) filter (where feed_ready) feed_ready,
           count(*) filter (where feed_ready and cutout_status = 'ok' and cutout_src = feed_image_url) cutout_ok,
           count(*) filter (where feed_ready and cutout_status = 'ok' and cutout_src = feed_image_url and image_check_status = 'ok' and image_check_src = feed_image_url and is_single_product
                              and exists (select 1 from offers o where o.product_id = products.id and o.availability = 'in_stock')) eligible
      from products where status = 'active' and (category = 'accessories' or feed_slot = 'accessory')
     group by 1 order by 2 desc) r;
$$;

-- ---- outfit accessories cache ------------------------------------------------------------------
create table public.outfit_accessories (
  outfit_id bigint not null,
  slot_no smallint not null check (slot_no between 1 and 3),
  product_id bigint not null,
  accessory_type text not null,
  placement text not null check (placement in ('head', 'inline', 'side')),   -- preferred placement kind; the layout may demote inline -> side
  zone text,                                                                  -- side-column zone / inline target (head, glasses, neck, seam, sleeve, upper, mid, hip, ground)
  score real,
  run_id integer not null,
  primary key (outfit_id, slot_no)
);
alter table public.outfit_accessories enable row level security;
revoke all on public.outfit_accessories from anon, authenticated;
create index outfit_accessories_run_idx on public.outfit_accessories (run_id);

-- Active pool rows (for the accessory builder).
create function public.outfit_pool_list(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'gender', o.gender, 'kind', o.kind, 'top', o.top_id, 'bottom', o.bottom_id, 'shoes', o.shoes_id, 'order', o.feed_order) order by o.id), '[]'::jsonb)
    from (select * from outfit_pool where active and id > p_after order by id limit least(p_limit, 2000)) o;
$$;

-- Eligible accessories with their attributes (cutout ok, single product, in stock, current image).
create function public.acc_inputs(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'store', s.slug, 'type', p.accessory_type, 'size', p.size_class, 'front_flat', p.front_flat,
             'belt_shape', p.belt_shape, 'gender', c.attributes->>'gender', 'styles', c.attributes->'style_weights', 'colors', c.attributes->'colors',
             'pattern', c.attributes->>'pattern', 'material', c.attributes->>'material', 'formality', (c.attributes->>'formality')::float,
             'boldness', (c.attributes->>'boldness')::float, 'statement', (c.attributes->>'statement_level')::float, 'season', c.attributes->'season') x
      from products p
      join lateral (select * from product_classifications c2 where c2.product_id = p.id and c2.taxonomy_version = 'acc1' order by c2.created_at desc limit 1) c on true
      join lateral (select source_id from offers o where o.product_id = p.id and o.availability = 'in_stock' limit 1) o on true
      join sources s on s.id = o.source_id
     where p.status = 'active' and p.feed_slot = 'accessory' and p.feed_ready
       and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url
       and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url and p.is_single_product
       and p.id > p_after
     order by p.id limit least(p_limit, 1000)) t;
$$;

create function public.outfit_acc_run_next() returns integer language sql as $$ select (coalesce(max(run_id), 0) + 1)::integer from public.outfit_accessories; $$;

create function public.outfit_acc_upsert(p_run integer, p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into outfit_accessories (outfit_id, slot_no, product_id, accessory_type, placement, zone, score, run_id)
  select i.outfit_id, i.slot_no, i.product_id, i.accessory_type, i.placement, i.zone, i.score, p_run
    from jsonb_to_recordset(p_items) as i(outfit_id bigint, slot_no integer, product_id bigint, accessory_type text, placement text, zone text, score real)
  on conflict (outfit_id, slot_no) do update set product_id = excluded.product_id, accessory_type = excluded.accessory_type, placement = excluded.placement,
       zone = excluded.zone, score = excluded.score, run_id = excluded.run_id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Rows from earlier runs (outfits that now have fewer accessories, or none) are removed.
create function public.outfit_acc_finish(p_run integer) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  delete from outfit_accessories where run_id < p_run;
  get diagnostics n = row_count;
  return n;
end $$;

-- Feed page: every outfit also carries its accessories (cached rows, no work per request).
create or replace function public.feed_list(p_gender text, p_device text, p_cursor integer, p_limit integer) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  c_page constant integer := 6;
  v_n integer; v_pages integer; v_start integer; v_items jsonb;
begin
  select coalesce(max(feed_order), -1) + 1 into v_n from outfit_pool where gender = p_gender and active;
  if v_n = 0 then return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', 0, 'size', 0); end if;
  v_pages := (v_n + c_page - 1) / c_page;
  if p_cursor is null then
    v_start := ((hashtextextended(coalesce(p_device, ''), 0) & 2147483647) % v_pages)::integer * c_page;
  else
    v_start := (p_cursor / c_page) % v_pages * c_page;
  end if;
  with picked as (
    select o.* from outfit_pool o where o.gender = p_gender and o.active and o.feed_order >= v_start and o.feed_order < v_start + c_page
  ),
  cards as (
    select pk.id, pk.kind, pk.score, pk.feed_order,
           product_card(pk.top_id, true) top, case when pk.bottom_id = 0 then null else product_card(pk.bottom_id, true) end bottom,
           product_card(pk.shoes_id, true) shoes,
           (select coalesce(jsonb_agg(jsonb_build_object('card', product_card(a.product_id, true), 'type', a.accessory_type, 'placement', a.placement,
                     'zone', a.zone, 'size', pr.size_class, 'front_flat', pr.front_flat, 'belt_shape', pr.belt_shape) order by a.slot_no), '[]'::jsonb)
              from outfit_accessories a join products pr on pr.id = a.product_id
             where a.outfit_id = pk.id and product_card(a.product_id, true) is not null) accessories
      from picked pk)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'score', c.score, 'order', c.feed_order,
                  'top', c.top, 'bottom', c.bottom, 'shoes', c.shoes, 'accessories', c.accessories) order by c.feed_order), '[]'::jsonb)
    into v_items
    from cards c
   where c.top is not null and c.shoes is not null and (c.kind = 'full' or c.bottom is not null);
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_start + c_page >= v_n then 0 else v_start + c_page end, 'size', v_n);
end $$;

revoke all on function public.acc_prefilter(), public.acc_todo(bigint, integer, text), public.acc_store(jsonb), public.acc_cost(text), public.acc_stats(),
  public.outfit_pool_list(bigint, integer), public.acc_inputs(bigint, integer), public.outfit_acc_run_next(), public.outfit_acc_upsert(integer, jsonb), public.outfit_acc_finish(integer)
  from public, anon, authenticated;
grant execute on function public.acc_prefilter(), public.acc_todo(bigint, integer, text), public.acc_store(jsonb), public.acc_cost(text), public.acc_stats(),
  public.outfit_pool_list(bigint, integer), public.acc_inputs(bigint, integer), public.outfit_acc_run_next(), public.outfit_acc_upsert(integer, jsonb), public.outfit_acc_finish(integer)
  to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('acc_prefilter'), ('acc_todo'), ('acc_store'), ('acc_cost'), ('acc_stats'), ('outfit_pool_list'), ('acc_inputs'),
  ('outfit_acc_run_next'), ('outfit_acc_upsert'), ('outfit_acc_finish') on conflict do nothing;
