-- /review: show the v2 classification of the preferred model, else the newest v2 row of any model.
create or replace function public.review_list(p jsonb) returns jsonb
language sql stable set search_path = public as $$
  with rows as (
    select pr.id, pr.brand, pr.name, pr.gender, pr.category, pr.subcategory, pr.feed_slot, pr.feed_ready, pr.image_status,
           pr.image_reason, pr.feed_image_url, pr.feed_bg_color, pr.feed_whiten, s.slug as store, c.attributes, c.model, c.cost_usd
    from products pr
    join lateral (select source_id from offers where product_id = pr.id limit 1) o on true
    join sources s on s.id = o.source_id
    join lateral (select * from product_classifications c2
                   where c2.product_id = pr.id and c2.taxonomy_version = 'v2'
                   order by (c2.model = coalesce(p->>'model', 'gemini-3.1-flash-lite')) desc, c2.created_at desc limit 1) c on true
    where pr.id > coalesce((p->>'after')::bigint, 0)
      and pr.status = 'active'
      and (p->>'source' is null or s.slug = p->>'source')
      and (p->>'category' is null or pr.category = p->>'category')
      and (p->>'feed_slot' is null or pr.feed_slot = p->>'feed_slot')
      and (p->>'gender' is null or pr.gender = p->>'gender')
      and (p->>'feed_ready' is null or pr.feed_ready = (p->>'feed_ready')::boolean)
    order by pr.id limit least(coalesce((p->>'limit')::int, 48), 100))
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows;
$$;
