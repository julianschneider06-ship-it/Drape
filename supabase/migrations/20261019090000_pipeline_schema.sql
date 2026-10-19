-- Drape data pipeline schema: sources, canonical products, offers, images,
-- raw items, ingestion runs, classification queue. RLS on, no public policies.
-- Internal ids are bigint identity (compact indexes, no random-uuid bloat at millions of rows).

create extension if not exists vector with schema extensions;

create table public.sources (
  id          integer generated always as identity primary key,
  slug        text not null unique,
  name        text not null,
  kind        text not null,                -- shopify | zalando | feed ...
  base_url    text,
  config      jsonb not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.ingestion_runs (
  id           bigint generated always as identity primary key,
  source_id    integer not null references public.sources(id),
  status       text not null default 'running' check (status in ('running','done','failed')),
  cursor       jsonb not null default '{}',   -- resume point (e.g. next page)
  stats        jsonb not null default '{}',
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index ingestion_runs_source_started_idx on public.ingestion_runs (source_id, started_at desc);

-- Raw source payloads: lets us re-normalize without re-crawling.
create table public.raw_items (
  id             bigint generated always as identity primary key,
  source_id      integer not null references public.sources(id),
  external_id    text not null,
  run_id         bigint references public.ingestion_runs(id),
  payload        jsonb not null,
  content_hash   text not null,
  first_seen_at  timestamptz not null default now(),
  fetched_at     timestamptz not null default now(),
  normalized_at  timestamptz,
  unique (source_id, external_id)
);
create index raw_items_unnormalized_idx on public.raw_items (id) where normalized_at is null;
create index raw_items_run_idx on public.raw_items (run_id);

-- Canonical products: one row per real-world product, merged across shops by canonical_key.
create table public.products (
  id                bigint generated always as identity primary key,
  canonical_key     text not null unique,
  brand             text not null,
  brand_norm        text not null,
  name              text not null,
  gender            text check (gender in ('women','men','unisex','kids')),
  category          text check (category in ('tops','bottoms','outerwear','dresses','shoes','accessories','other')),
  subcategory       text,
  colour            text,
  primary_image_url text,
  status            text not null default 'active' check (status in ('active','hidden')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_category_gender_idx on public.products (category, gender, id);
create index products_brand_idx on public.products (brand_norm, id);

-- Offers: one product, many shops.
create table public.offers (
  id               bigint generated always as identity primary key,
  product_id       bigint not null references public.products(id) on delete cascade,
  source_id        integer not null references public.sources(id),
  external_id      text not null,
  url              text not null,
  price_cents      integer,
  compare_at_cents integer,
  currency         char(3),
  availability     text not null default 'unknown' check (availability in ('in_stock','out_of_stock','unknown')),
  raw_item_id      bigint references public.raw_items(id),
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_id, external_id)
);
create index offers_product_idx on public.offers (product_id);
create index offers_source_seen_idx on public.offers (source_id, last_seen_at);

create table public.product_images (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references public.products(id) on delete cascade,
  url         text not null,
  position    smallint not null default 0,
  width       integer,
  height      integer,
  created_at  timestamptz not null default now(),
  unique (product_id, url)
);
create index product_images_product_pos_idx on public.product_images (product_id, position);

-- Empty for now; filled by the AI classification step.
create table public.classification_queue (
  id          bigint generated always as identity primary key,
  product_id  bigint not null unique references public.products(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','processing','done','failed')),
  priority    smallint not null default 0,
  attempts    smallint not null default 0,
  locked_at   timestamptz,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index classification_queue_pending_idx on public.classification_queue (priority desc, id) where status = 'pending';

-- RLS on, no policies: only the service role (which bypasses RLS) can touch these.
alter table public.sources              enable row level security;
alter table public.ingestion_runs       enable row level security;
alter table public.raw_items            enable row level security;
alter table public.products             enable row level security;
alter table public.offers               enable row level security;
alter table public.product_images       enable row level security;
alter table public.classification_queue enable row level security;
revoke all on public.sources, public.ingestion_runs, public.raw_items, public.products,
  public.offers, public.product_images, public.classification_queue from anon, authenticated;

-- Batch upsert, idempotent per (source_id, external_id). One call = whole batch, set-based.
-- item: {external_id,url,brand,name,gender,category,subcategory,colour,canonical_key,
--        price_cents,compare_at_cents,currency,availability,content_hash,raw,images:[{url,width,height}]}
create or replace function public.ingest_batch(p_source_id integer, p_run_id bigint, p_items jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_items int := jsonb_array_length(p_items);
  v_new_offers int;
begin
  create temp table _in on commit drop as
  select * from jsonb_to_recordset(p_items) as x(
    external_id text, url text, brand text, name text, gender text, category text, subcategory text,
    colour text, canonical_key text, price_cents int, compare_at_cents int, currency text,
    availability text, content_hash text, raw jsonb, images jsonb);

  -- 1) raw payloads
  insert into raw_items (source_id, external_id, run_id, payload, content_hash, normalized_at)
  select p_source_id, external_id, p_run_id, raw, content_hash, now() from _in
  on conflict (source_id, external_id) do update
    set payload = excluded.payload, content_hash = excluded.content_hash,
        run_id = excluded.run_id, fetched_at = now(), normalized_at = now();

  -- 2) canonical products (dedupe inside the batch first)
  create temp table _prod (id bigint, canonical_key text) on commit drop;
  with ins as (
  insert into products (canonical_key, brand, brand_norm, name, gender, category, subcategory, colour, primary_image_url)
  select distinct on (canonical_key)
    canonical_key, brand, lower(brand), name, gender, category, subcategory, colour,
    images->0->>'url'
  from _in
  order by canonical_key, external_id
  on conflict (canonical_key) do update
    set name = excluded.name,
        gender = coalesce(excluded.gender, products.gender),
        category = coalesce(excluded.category, products.category),
        subcategory = coalesce(excluded.subcategory, products.subcategory),
        colour = coalesce(excluded.colour, products.colour),
        primary_image_url = coalesce(products.primary_image_url, excluded.primary_image_url),
        updated_at = now()
  returning id, canonical_key
  )
  insert into _prod select id, canonical_key from ins;

  -- 3) offers
  with up as (
    insert into offers (product_id, source_id, external_id, url, price_cents, compare_at_cents,
                        currency, availability, raw_item_id)
    select p.id, p_source_id, i.external_id, i.url, i.price_cents, i.compare_at_cents,
           i.currency, coalesce(i.availability, 'unknown'), r.id
    from _in i
    join _prod p on p.canonical_key = i.canonical_key
    join raw_items r on r.source_id = p_source_id and r.external_id = i.external_id
    on conflict (source_id, external_id) do update
      set product_id = excluded.product_id, url = excluded.url,
          price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents,
          currency = excluded.currency, availability = excluded.availability,
          raw_item_id = excluded.raw_item_id, last_seen_at = now(), updated_at = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_new_offers from up;

  -- 4) images
  insert into product_images (product_id, url, position, width, height)
  select distinct on (p.id, e.obj->>'url') p.id, e.obj->>'url', (e.ord - 1)::smallint,
         (e.obj->>'width')::int, (e.obj->>'height')::int
  from _in i
  join _prod p on p.canonical_key = i.canonical_key
  cross join lateral jsonb_array_elements(coalesce(i.images, '[]'::jsonb)) with ordinality as e(obj, ord)
  where e.obj->>'url' is not null
  order by p.id, e.obj->>'url', e.ord
  on conflict (product_id, url) do nothing;

  return jsonb_build_object('items', v_items, 'new_offers', v_new_offers);
end $$;
revoke all on function public.ingest_batch(integer, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_batch(integer, bigint, jsonb) to service_role;
