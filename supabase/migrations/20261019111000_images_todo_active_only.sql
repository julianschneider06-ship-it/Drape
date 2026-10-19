-- images_todo: only active products (hidden orphans from the first sample run are skipped).
create or replace function public.images_todo(p_after bigint, p_products integer) returns jsonb
language sql stable set search_path = public as $$
  with ps as (
    select distinct i.product_id from product_images i join products p on p.id = i.product_id
    where i.analyzed_at is null and i.product_id > p_after and p.status = 'active'
    order by i.product_id limit p_products)
  select coalesce(jsonb_agg(jsonb_build_object('product_id', ps.product_id, 'images', imgs) order by ps.product_id), '[]'::jsonb)
  from ps
  cross join lateral (
    select jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url, 'pos', coalesce(i.source_position, i.position + 1),
                                        'alt', i.alt, 'width', i.width, 'height', i.height) order by i.id) imgs
    from product_images i where i.product_id = ps.product_id and i.analyzed_at is null) x;
$$;
