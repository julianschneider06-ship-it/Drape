-- Image pre-selection, feed readiness, classification queue upgrades, job functions.

-- 1) Images: scoring columns (filled by the free pre-selection job).
alter table public.product_images
  add column alt             text,
  add column source_position smallint,
  add column feed_rank       smallint,          -- 1 = best feed candidate, 2 = runner-up
  add column bg_whiteness    real,              -- share of near-white border pixels, 0..1
  add column object_fill     real,              -- share of the frame the product fills, 0..1
  add column view_hint       text,              -- front | back | detail | model | flat | unknown
  add column score           real,
  add column selected        boolean not null default false,
  add column analyzed_at     timestamptz;
create index product_images_selected_idx on public.product_images (product_id) where selected;
create index product_images_todo_idx on public.product_images (product_id) where analyzed_at is null;

-- Backfill ALL images (max 10 per product) from the stored raw payloads. No re-crawl. Idempotent.
create or replace function public.backfill_product_images() returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with ins as (
    insert into product_images (product_id, url, position, width, height, alt, source_position)
    select o.product_id, e.obj->>'src', (e.ord - 1)::smallint, (e.obj->>'width')::int, (e.obj->>'height')::int,
           e.obj->>'alt', e.ord::smallint
    from offers o
    join raw_items r on r.id = o.raw_item_id
    cross join lateral jsonb_array_elements(coalesce(r.payload->'images', '[]'::jsonb)) with ordinality as e(obj, ord)
    where e.ord <= 10 and e.obj->>'src' is not null
    on conflict (product_id, url) do update
      set alt = excluded.alt, source_position = excluded.source_position,
          width = coalesce(product_images.width, excluded.width),
          height = coalesce(product_images.height, excluded.height)
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;

-- Next batch of unanalyzed images, grouped per product (cursor = product id).
create or replace function public.images_todo(p_after bigint, p_products integer) returns jsonb
language sql stable set search_path = public as $$
  with ps as (
    select distinct product_id from product_images
    where analyzed_at is null and product_id > p_after
    order by product_id limit p_products)
  select coalesce(jsonb_agg(jsonb_build_object('product_id', ps.product_id, 'images', imgs)), '[]'::jsonb)
  from ps
  cross join lateral (
    select jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url, 'pos', coalesce(i.source_position, i.position + 1),
                                        'alt', i.alt, 'width', i.width, 'height', i.height) order by i.id) imgs
    from product_images i where i.product_id = ps.product_id and i.analyzed_at is null) x;
$$;

-- Store scores. items: [{id, bg_whiteness, object_fill, view_hint, score, feed_rank}]
create or replace function public.images_apply(p_items jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (
    update product_images i
       set bg_whiteness = x.bg_whiteness, object_fill = x.object_fill, view_hint = x.view_hint,
           score = x.score, feed_rank = x.feed_rank, selected = (x.feed_rank = 1), analyzed_at = now()
      from jsonb_to_recordset(p_items) as x(id bigint, bg_whiteness real, object_fill real, view_hint text, score real, feed_rank int)
     where i.id = x.id
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

-- 2) Products: feed readiness (denormalized from the latest v2 classification for fast feed queries).
alter table public.products
  add column feed_slot      text check (feed_slot in ('top','bottom','shoes','full_body','none')),
  add column feed_ready     boolean not null default false,
  add column image_status   text not null default 'pending' check (image_status in ('pending','feed_ready','needs_image_work')),
  add column image_reason   text check (image_reason in ('has_model','needs_cutout','low_suitability')),
  add column feed_image_url text,
  add column classified_at  timestamptz;
create index products_feed_ready_idx on public.products (feed_slot, gender, id) where feed_ready;
create index products_image_work_idx on public.products (image_reason, id) where image_status = 'needs_image_work';

-- 3) Classification queue: one row per product (existing unique key), tagged with the taxonomy version it is queued for.
-- Moving to a new taxonomy re-queues the same row (see queue_enqueue).
alter table public.classification_queue
  add column taxonomy_version text not null default 'v2';

alter table public.product_classifications add column input_hash text;

create or replace function public.queue_enqueue(p_ids bigint[], p_tax text) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with i as (insert into classification_queue (product_id, taxonomy_version)
             select unnest(p_ids), p_tax
             on conflict (product_id) do update
               set taxonomy_version = excluded.taxonomy_version, status = 'pending', attempts = 0, last_error = null, updated_at = now()
               where classification_queue.taxonomy_version <> excluded.taxonomy_version
             returning 1)
  select count(*) into v_n from i;
  return v_n;
end $$;

-- Claim a batch (also re-claims rows stuck in 'processing' for > 10 minutes after a crash).
create or replace function public.claim_classification_batch(p_n integer, p_tax text) returns jsonb
language sql set search_path = public as $$
  with c as (
    update classification_queue q
       set status = 'processing', locked_at = now(), attempts = q.attempts + 1, updated_at = now()
     where q.id in (
       select id from classification_queue
        where taxonomy_version = p_tax and attempts < 3
          and (status = 'pending' or (status = 'processing' and locked_at < now() - interval '10 minutes'))
        order by priority desc, id limit p_n for update skip locked)
    returning q.id, q.product_id, q.attempts)
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from c;
$$;

create or replace function public.queue_finish(p_id bigint, p_ok boolean, p_error text) returns void
language sql set search_path = public as $$
  update classification_queue
     set status = case when p_ok then 'done' when attempts >= 3 then 'failed' else 'pending' end,
         last_error = p_error, locked_at = null, updated_at = now()
   where id = p_id;
$$;

-- Everything the job needs for a set of products: text + top-2 images + existing input hash for this model.
create or replace function public.classify_inputs(p_ids bigint[], p_tax text, p_model text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'brand', p.brand, 'name', p.name, 'category', p.category, 'subcategory', p.subcategory,
    'images', (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'rank', i.feed_rank, 'score', i.score) order by i.feed_rank), '[]'::jsonb)
                 from product_images i where i.product_id = p.id and i.feed_rank <= 2),
    'existing_hash', (select c.input_hash from product_classifications c
                       where c.product_id = p.id and c.taxonomy_version = p_tax and c.model = p_model))), '[]'::jsonb)
  from products p where p.id = any (p_ids);
$$;

-- Store one finished classification (+ embedding), update feed fields, finish the queue row. All-or-nothing.
-- p: {product_id, queue_id, update_product, classification:{...}, embedding:{... embedding:"[..]"}, feed:{...}}
create or replace function public.classification_store(p jsonb) returns jsonb
language plpgsql set search_path = public, extensions as $$
declare
  v_pid bigint := (p->>'product_id')::bigint;
  c jsonb := p->'classification';
  e jsonb := p->'embedding';
  f jsonb := p->'feed';
begin
  insert into product_classifications (product_id, taxonomy_version, model, model_version, attributes, confidence, valid,
                                       usage, cost_usd, latency_ms, source_image_url, input_hash)
  values (v_pid, c->>'taxonomy_version', c->>'model', c->>'model_version', c->'attributes', (c->>'confidence')::real,
          (c->>'valid')::boolean, c->'usage', (c->>'cost_usd')::numeric, (c->>'latency_ms')::int, c->>'source_image_url', c->>'input_hash')
  on conflict (product_id, taxonomy_version, model) do update
    set model_version = excluded.model_version, attributes = excluded.attributes, confidence = excluded.confidence,
        valid = excluded.valid, usage = excluded.usage, cost_usd = excluded.cost_usd, latency_ms = excluded.latency_ms,
        source_image_url = excluded.source_image_url, input_hash = excluded.input_hash;

  if e is not null and e <> 'null'::jsonb then
    insert into product_embeddings (product_id, kind, model, model_version, dims, embedding, source_image_url, usage, cost_usd)
    values (v_pid, 'image', e->>'model', e->>'model_version', (e->>'dims')::int, (e->>'embedding')::vector,
            e->>'source_image_url', e->'usage', (e->>'cost_usd')::numeric)
    on conflict (product_id, kind, model, dims) do update
      set model_version = excluded.model_version, embedding = excluded.embedding,
          source_image_url = excluded.source_image_url, usage = excluded.usage, cost_usd = excluded.cost_usd;
  end if;

  if coalesce((p->>'update_product')::boolean, false) then
    update products
       set feed_slot = f->>'feed_slot', feed_ready = (f->>'feed_ready')::boolean,
           image_status = case when (f->>'feed_ready')::boolean then 'feed_ready' else 'needs_image_work' end,
           image_reason = f->>'image_reason', feed_image_url = f->>'feed_image_url', classified_at = now(), updated_at = now()
     where id = v_pid;
  end if;

  if p ? 'queue_id' and p->>'queue_id' is not null then
    perform queue_finish((p->>'queue_id')::bigint, true, null);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Stratified sample: quotas per category, spread round-robin over store and gender. Returns product ids.
create or replace function public.pick_classification_sample(p_quotas jsonb) returns bigint[]
language sql stable set search_path = public as $$
  with base as (
    select p.id, p.category,
           row_number() over (partition by p.category, o.source_id, p.gender order by md5(p.id::text)) rn_cell
    from products p
    join offers o on o.product_id = p.id
    where p.status = 'active' and p.category <> 'other'
      and exists (select 1 from product_images i where i.product_id = p.id and i.selected)),
  ranked as (
    select id, category, row_number() over (partition by category order by rn_cell, md5(id::text)) rn from base)
  select coalesce(array_agg(id), '{}') from ranked
  where rn <= coalesce((p_quotas->>category)::int, 0);
$$;

-- Read-only list for the /review page. p: {source, category, feed_slot, feed_ready, after, limit}
create or replace function public.review_list(p jsonb) returns jsonb
language sql stable set search_path = public as $$
  with rows as (
    select pr.id, pr.brand, pr.name, pr.gender, pr.category, pr.subcategory, pr.feed_slot, pr.feed_ready, pr.image_status,
           pr.image_reason, pr.feed_image_url, s.slug as store, c.attributes, c.model, c.cost_usd
    from products pr
    join lateral (select source_id from offers where product_id = pr.id limit 1) o on true
    join sources s on s.id = o.source_id
    join product_classifications c on c.product_id = pr.id and c.taxonomy_version = 'v2'
         and c.model = coalesce(p->>'model', 'gemini-3.5-flash-lite')
    where pr.id > coalesce((p->>'after')::bigint, 0)
      and (p->>'source' is null or s.slug = p->>'source')
      and (p->>'category' is null or pr.category = p->>'category')
      and (p->>'feed_slot' is null or pr.feed_slot = p->>'feed_slot')
      and (p->>'feed_ready' is null or pr.feed_ready = (p->>'feed_ready')::boolean)
    order by pr.id limit least(coalesce((p->>'limit')::int, 48), 100))
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows;
$$;

-- Vector index for nearest-neighbour search (cosine).
create index product_embeddings_hnsw_idx on public.product_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- Only the service role may call these.
do $$
declare fn text;
begin
  foreach fn in array array[
    'backfill_product_images()', 'images_todo(bigint,integer)', 'images_apply(jsonb)', 'queue_enqueue(bigint[],text)',
    'claim_classification_batch(integer,text)', 'queue_finish(bigint,boolean,text)', 'classify_inputs(bigint[],text,text)',
    'classification_store(jsonb)', 'pick_classification_sample(jsonb)', 'review_list(jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
