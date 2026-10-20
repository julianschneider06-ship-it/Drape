-- outfit_inputs: include the product name (exclusion rules look at it, e.g. "boxer shorts", "pyjama").
create or replace function public.outfit_inputs(p_after bigint, p_limit integer) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'store', s.slug, 'slot', p.feed_slot, 'gender', c.attributes->>'gender',
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
