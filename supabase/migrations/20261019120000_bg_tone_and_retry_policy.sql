-- Background tone of feed images (so the feed can blend/whiten plain light-neutral backdrops),
-- data-derived per-store retry policy, "already classified" check, feed bg refresh.

alter table public.product_images
  add column bg_color       text,   -- median border colour of the thumbnail, hex like #e8e3df
  add column whiten_factor  real;   -- 255 / luma(bg_color), capped: CSS filter brightness() factor that turns the backdrop white
alter table public.products
  add column feed_bg_color  text,   -- denormalized from the chosen feed image
  add column feed_whiten    real;

create or replace function public.images_apply(p_items jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (
    update product_images i
       set bg_whiteness = x.bg_whiteness, object_fill = x.object_fill, view_hint = x.view_hint,
           score = x.score, feed_rank = x.feed_rank, selected = (x.feed_rank = 1), analyzed_at = now(),
           bg_color = x.bg_color, whiten_factor = x.whiten_factor
      from jsonb_to_recordset(p_items) as x(id bigint, bg_whiteness real, object_fill real, view_hint text, score real,
                                            feed_rank int, bg_color text, whiten_factor real)
     where i.id = x.id
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

-- Job inputs: adds the store slug (for the retry policy) and whether ANY model already classified it with this taxonomy.
create or replace function public.classify_inputs(p_ids bigint[], p_tax text, p_model text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'brand', p.brand, 'name', p.name, 'category', p.category, 'subcategory', p.subcategory,
    'store', (select s.slug from offers o join sources s on s.id = o.source_id where o.product_id = p.id limit 1),
    'images', (select coalesce(jsonb_agg(jsonb_build_object('url', i.url, 'rank', i.feed_rank, 'score', i.score) order by i.feed_rank), '[]'::jsonb)
                 from product_images i where i.product_id = p.id and i.feed_rank <= 2),
    'existing_hash', (select c.input_hash from product_classifications c
                       where c.product_id = p.id and c.taxonomy_version = p_tax and c.model = p_model),
    'has_v2', exists (select 1 from product_classifications c where c.product_id = p.id and c.taxonomy_version = p_tax))), '[]'::jsonb)
  from products p where p.id = any (p_ids);
$$;

-- Per-store image profile derived from classification results (no hardcoded store list).
-- skip_retry = the store's first pick is rejected (suitability < 0.5) in >= 80% of products AND the runner-up
-- rarely helps (<= 30% of retries) -> the retry just burns money. Needs >= 12 classified products to decide.
create or replace function public.store_retry_policy() returns jsonb
language sql stable set search_path = public as $$
  with s as (
    select src.slug,
           count(*) n,
           count(*) filter (where c.valid is false or (c.usage->'attempts'->0->>'feed_suitability')::float < 0.5) rejected,
           count(*) filter (where jsonb_array_length(c.usage->'attempts') = 2) retried,
           count(*) filter (where jsonb_array_length(c.usage->'attempts') = 2 and c.source_image_url <> c.usage->'attempts'->0->>'image') rescued
      from product_classifications c
      join products p on p.id = c.product_id
      join lateral (select source_id from offers where product_id = p.id limit 1) o on true
      join sources src on src.id = o.source_id
     where c.taxonomy_version = 'v2' and c.usage ? 'attempts'
     group by 1)
  select coalesce(jsonb_object_agg(slug, jsonb_build_object(
    'n', n, 'rejected_rate', round(rejected::numeric / n, 2),
    'rescue_rate', case when retried > 0 then round(rescued::numeric / retried, 2) end,
    'skip_retry', n >= 12 and rejected::numeric / n >= 0.8 and coalesce(rescued::numeric / nullif(retried, 0), 0) <= 0.3)), '{}'::jsonb)
  from s;
$$;

-- Copy bg tone of the chosen image onto the product (idempotent).
create or replace function public.refresh_feed_bg() returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (
    update products p set feed_bg_color = i.bg_color, feed_whiten = i.whiten_factor
      from product_images i
     where i.product_id = p.id and i.url = p.feed_image_url
       and (p.feed_bg_color is distinct from i.bg_color or p.feed_whiten is distinct from i.whiten_factor)
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['images_apply(jsonb)', 'classify_inputs(bigint[],text,text)', 'store_retry_policy()', 'refresh_feed_bg()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
