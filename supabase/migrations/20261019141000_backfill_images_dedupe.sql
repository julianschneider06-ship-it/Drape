-- backfill_product_images: de-duplicate (product, url) inside the batch (merged products have several offers).
create or replace function public.backfill_product_images() returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with src as (
    select distinct on (o.product_id, e.obj->>'src')
           o.product_id, e.obj->>'src' as url, (e.ord - 1)::smallint as position, (e.obj->>'width')::int as width,
           (e.obj->>'height')::int as height, e.obj->>'alt' as alt, e.ord::smallint as source_position
    from offers o
    join raw_items r on r.id = o.raw_item_id
    cross join lateral jsonb_array_elements(coalesce(r.payload->'images', '[]'::jsonb)) with ordinality as e(obj, ord)
    where e.ord <= 10 and e.obj->>'src' is not null
    order by o.product_id, e.obj->>'src', e.ord),
  ins as (
    insert into product_images (product_id, url, position, width, height, alt, source_position)
    select product_id, url, position, width, height, alt, source_position from src
    on conflict (product_id, url) do update
      set alt = excluded.alt, source_position = excluded.source_position,
          width = coalesce(product_images.width, excluded.width),
          height = coalesce(product_images.height, excluded.height)
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;
