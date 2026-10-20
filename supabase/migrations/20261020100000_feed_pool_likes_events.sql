-- Step 3: precomputed outfit pool (a cache, outfits are NOT a saved unit), likes (belong to products),
-- append-only partitioned event log, feed/likes/events functions, data-driven gateway allowlists.

-- 0) Gateway permissions as data (no redeploy needed to add a function or change a token's rights).
create table public.pipeline_rpc_allowlist (fn text primary key);
alter table public.pipeline_rpc_allowlist enable row level security;
revoke all on public.pipeline_rpc_allowlist from anon, authenticated;
alter table public.pipeline_tokens add column allowed_fns text[];   -- null = everything; else rpc names (+ 'sample')

-- 1) Outfit pool. Product ids only; bottom_id = 0 means "full_body piece in top_id, no separate bottom".
create sequence public.outfit_run_seq;
create table public.outfit_pool (
  id          bigint generated always as identity primary key,
  gender      text not null check (gender in ('women','men')),
  kind        text not null check (kind in ('three','full')),
  top_id      bigint not null,
  bottom_id   bigint not null default 0,
  shoes_id    bigint not null,
  score       real not null,
  style_key   text,
  feed_order  integer not null,
  active      boolean not null default true,
  run_id      integer not null,
  created_at  timestamptz not null default now(),
  unique (gender, top_id, bottom_id, shoes_id)
);
create index outfit_pool_feed_idx on public.outfit_pool (gender, feed_order) where active;
create index outfit_pool_run_idx on public.outfit_pool (gender, run_id);
alter table public.outfit_pool enable row level security;
revoke all on public.outfit_pool from anon, authenticated;

-- 2) Likes: per device (anonymous), per product. Soft toggle, the history lives in the event log.
create table public.likes (
  device_id   uuid not null,
  product_id  bigint not null references public.products(id) on delete cascade,
  liked       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (device_id, product_id)
);
create index likes_device_idx on public.likes (device_id, updated_at desc) where liked;
create index likes_product_idx on public.likes (product_id) where liked;
alter table public.likes enable row level security;
revoke all on public.likes from anon, authenticated;

-- 3) Event log: append-only, partitioned by month (created_at). No PK needed; id comes from a sequence.
create sequence public.events_id_seq;
create table public.events (
  id           bigint not null default nextval('public.events_id_seq'),
  device_id    uuid not null,
  event_type   text not null check (event_type in ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past')),
  product_id   bigint,
  product_ids  bigint[],
  outfit_id    bigint,
  slot         text,            -- top | bottom | shoes | full | sheet
  feed_index   integer,         -- position of the outfit in this device's feed session
  gender       text,
  dwell_ms     integer,
  ctx          jsonb,
  client_ts    timestamptz,
  created_at   timestamptz not null default now()
) partition by range (created_at);

create function public.events_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'events is append-only';
end $$;
create trigger events_append_only before update or delete on public.events
  for each row execute function public.events_immutable();

-- Creates monthly partitions (this month + p_months ahead) plus a default partition. Idempotent; run monthly (cron) later.
create function public.ensure_event_partitions(p_months integer) returns integer
language plpgsql set search_path = public as $$
declare m date; n integer := 0; nm text;
begin
  if not exists (select 1 from pg_class where relname = 'events_default') then
    execute 'create table public.events_default partition of public.events default';
    execute 'alter table public.events_default enable row level security';
    execute 'revoke all on public.events_default from anon, authenticated';
    n := n + 1;
  end if;
  for i in 0..p_months loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    nm := 'events_p' || to_char(m, 'YYYYMM');
    if not exists (select 1 from pg_class where relname = nm) then
      execute format('create table public.%I partition of public.events for values from (%L) to (%L)', nm, m, (m + interval '1 month')::date);
      execute format('alter table public.%I enable row level security', nm);
      execute format('revoke all on public.%I from anon, authenticated', nm);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
select public.ensure_event_partitions(12);
create index events_device_time_idx on public.events (device_id, created_at);
create index events_product_time_idx on public.events (product_id, created_at) where product_id is not null;
create index events_type_time_idx on public.events (event_type, created_at);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- 4) Functions ----------------------------------------------------------------------------------

-- One product as the feed needs it (cheapest in-stock offer; null if none and p_stock is true).
create function public.product_card(p_id bigint, p_stock boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'image', p.feed_image_url,
           'bg', p.feed_bg_color, 'whiten', p.feed_whiten, 'price_cents', o.price_cents, 'compare_at_cents', o.compare_at_cents,
           'currency', o.currency, 'url', o.url, 'store', s.slug, 'in_stock', o.availability = 'in_stock')
    from products p
    join lateral (select * from offers o2 where o2.product_id = p.id and (not p_stock or o2.availability = 'in_stock')
                   order by (o2.availability = 'in_stock') desc, o2.price_cents nulls last limit 1) o on true
    join sources s on s.id = o.source_id
   where p.id = p_id and p.status = 'active' and (not p_stock or p.feed_ready);
$$;

-- Feed page: cursor over the precomputed order (circular), starting at a per-device offset. Indexed, no scans.
create function public.feed_list(p_gender text, p_device text, p_cursor integer, p_limit integer) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_n integer; v_start integer; v_lim integer := least(greatest(coalesce(p_limit, 6), 1), 12); v_items jsonb;
begin
  select coalesce(max(feed_order), -1) + 1 into v_n from outfit_pool where gender = p_gender and active;
  if v_n = 0 then return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', 0, 'size', 0); end if;
  v_start := coalesce(p_cursor, (hashtextextended(coalesce(p_device, ''), 0) & 2147483647)::integer) % v_n;
  with picked as (
    select * from (
      (select o.* from outfit_pool o where o.gender = p_gender and o.active and o.feed_order >= v_start order by o.feed_order limit v_lim)
      union all
      (select o.* from outfit_pool o where o.gender = p_gender and o.active and o.feed_order < v_start order by o.feed_order limit v_lim)
    ) u order by (u.feed_order < v_start), u.feed_order limit v_lim),
  cards as (
    select pk.id, pk.kind, pk.score, pk.feed_order,
           product_card(pk.top_id, true) top, case when pk.bottom_id = 0 then null else product_card(pk.bottom_id, true) end bottom,
           product_card(pk.shoes_id, true) shoes
      from picked pk)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'score', c.score, 'order', c.feed_order,
                  'top', c.top, 'bottom', c.bottom, 'shoes', c.shoes) order by (c.feed_order < v_start), c.feed_order), '[]'::jsonb)
    into v_items
    from cards c
   where c.top is not null and c.shoes is not null and (c.kind = 'full' or c.bottom is not null);
  return jsonb_build_object('items', v_items, 'next_cursor', (v_start + v_lim) % v_n, 'size', v_n);
end $$;

create function public.like_set(p_device uuid, p_product bigint, p_liked boolean) returns jsonb
language plpgsql set search_path = public as $$
begin
  insert into likes (device_id, product_id, liked) values (p_device, p_product, p_liked)
  on conflict (device_id, product_id) do update set liked = excluded.liked, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create function public.likes_list(p_device uuid) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('product', product_card(l.product_id, false), 'liked_at', l.updated_at) order by l.updated_at desc), '[]'::jsonb)
    from (select * from likes where device_id = p_device and liked order by updated_at desc limit 500) l
   where product_card(l.product_id, false) is not null;
$$;

-- Batched event insert (max 100 per call; unknown types are dropped, not errors).
create function public.events_append(p_device uuid, p_events jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with ins as (
    insert into events (device_id, event_type, product_id, product_ids, outfit_id, slot, feed_index, gender, dwell_ms, ctx, client_ts)
    select p_device, e.event_type, e.product_id, e.product_ids, e.outfit_id, e.slot, e.feed_index, e.gender, e.dwell_ms, e.ctx, e.client_ts
      from jsonb_to_recordset(case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end)
           as e(event_type text, product_id bigint, product_ids bigint[], outfit_id bigint, slot text, feed_index integer,
                gender text, dwell_ms integer, ctx jsonb, client_ts timestamptz)
     where e.event_type in ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past')
     limit 100
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;

-- Pool builder inputs: feed-ready, in-stock products with their v2 attributes (paged by product id).
create function public.outfit_inputs(p_after bigint, p_limit integer) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'store', s.slug, 'slot', p.feed_slot, 'gender', c.attributes->>'gender',
             'category', c.attributes->>'category', 'sub', c.attributes->>'subcategory', 'styles', c.attributes->'style_weights',
             'colors', c.attributes->'colors', 'pattern', c.attributes->>'pattern', 'material', c.attributes->>'material',
             'silhouette', c.attributes->>'silhouette', 'fit', c.attributes->>'fit', 'formality', (c.attributes->>'formality')::float,
             'boldness', (c.attributes->>'boldness')::float, 'statement', (c.attributes->>'statement_level')::float,
             'outer', (c.attributes->>'is_outer_layer')::boolean, 'season', c.attributes->'season') x
      from products p
      join lateral (select * from product_classifications c2 where c2.product_id = p.id and c2.taxonomy_version = 'v2'
                     order by (c2.model = 'gemini-3.1-flash-lite') desc, c2.created_at desc limit 1) c on true
      join lateral (select source_id from offers o where o.product_id = p.id and o.availability = 'in_stock' limit 1) o on true
      join sources s on s.id = o.source_id
     where p.status = 'active' and p.feed_ready and p.feed_slot in ('top','bottom','shoes','full_body') and p.id > p_after
     order by p.id limit least(p_limit, 1000)) t;
$$;

create function public.outfit_run_next() returns integer language sql as $$ select nextval('public.outfit_run_seq')::integer; $$;

-- Idempotent upsert of pool rows. items: [{gender, kind, top_id, bottom_id, shoes_id, score, style_key, feed_order}]
create function public.outfit_pool_upsert(p_run integer, p_items jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (
    insert into outfit_pool (gender, kind, top_id, bottom_id, shoes_id, score, style_key, feed_order, run_id, active)
    select x.gender, x.kind, x.top_id, coalesce(x.bottom_id, 0), x.shoes_id, x.score, x.style_key, x.feed_order, p_run, true
      from jsonb_to_recordset(p_items) as x(gender text, kind text, top_id bigint, bottom_id bigint, shoes_id bigint, score real, style_key text, feed_order integer)
    on conflict (gender, top_id, bottom_id, shoes_id) do update
      set score = excluded.score, style_key = excluded.style_key, feed_order = excluded.feed_order, run_id = p_run, active = true
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

-- Retire rows that the latest run did not produce (no deletes: they simply become inactive).
create function public.outfit_pool_finish(p_run integer, p_gender text) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (update outfit_pool set active = false where gender = p_gender and active and run_id <> p_run returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

-- Permissions: service role only; web token rights are data in pipeline_tokens.allowed_fns.
do $$
declare fn text;
begin
  foreach fn in array array['product_card(bigint,boolean)', 'feed_list(text,text,integer,integer)', 'like_set(uuid,bigint,boolean)',
    'likes_list(uuid)', 'events_append(uuid,jsonb)', 'outfit_inputs(bigint,integer)', 'outfit_run_next()',
    'outfit_pool_upsert(integer,jsonb)', 'outfit_pool_finish(integer,text)', 'ensure_event_partitions(integer)', 'events_immutable()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

insert into public.pipeline_rpc_allowlist (fn) values
  ('backfill_product_images'), ('images_todo'), ('images_apply'), ('queue_enqueue'), ('claim_classification_batch'), ('queue_finish'),
  ('classify_inputs'), ('classification_store'), ('pick_classification_sample'), ('review_list'), ('store_retry_policy'), ('refresh_feed_bg'),
  ('feed_list'), ('like_set'), ('likes_list'), ('events_append'), ('outfit_inputs'), ('outfit_run_next'), ('outfit_pool_upsert'), ('outfit_pool_finish');

-- The web app token may only read the review list / sample and use the feed, likes and event functions.
update public.pipeline_tokens set allowed_fns = array['sample','review_list','feed_list','like_set','likes_list','events_append']
 where label like 'vercel%';
