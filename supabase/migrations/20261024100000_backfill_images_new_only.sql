-- backfill_product_images_new: image rows only for products that have none yet, in small batches (fast with a big catalogue).
create or replace function public.backfill_product_images_new(p_products integer default 300) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with todo as (
    select p.id from products p where not exists (select 1 from product_images i where i.product_id = p.id)
      and exists (select 1 from offers o where o.product_id = p.id) order by p.id limit p_products),
  src as (
    select distinct on (o.product_id, e.obj->>'src')
           o.product_id, e.obj->>'src' as url, (e.ord - 1)::smallint as position, (e.obj->>'width')::int as width,
           (e.obj->>'height')::int as height, e.obj->>'alt' as alt, e.ord::smallint as source_position
    from todo t
    join offers o on o.product_id = t.id
    join raw_items r on r.id = o.raw_item_id
    cross join lateral jsonb_array_elements(coalesce(r.payload->'images', '[]'::jsonb)) with ordinality as e(obj, ord)
    where e.ord <= 10 and e.obj->>'src' is not null
    order by o.product_id, e.obj->>'src', e.ord),
  ins as (
    insert into product_images (product_id, url, position, width, height, alt, source_position)
    select product_id, url, position, width, height, alt, source_position from src
    on conflict (product_id, url) do nothing
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;
revoke all on function public.backfill_product_images_new(integer) from public, anon, authenticated;
grant execute on function public.backfill_product_images_new(integer) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('backfill_product_images_new') on conflict do nothing;
