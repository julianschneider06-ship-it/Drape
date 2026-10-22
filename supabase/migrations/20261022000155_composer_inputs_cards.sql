-- composer_inputs also returns the display fields of a feed card, so the dynamic feed builds cards from the in-memory catalogue (no cards_by_ids round trip).
-- Price / stock then follow the snapshot (refreshed when its version stamp changes); that is acceptable for a prototype and is noted in the architecture doc.
create or replace function public.composer_inputs(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'aspect', p.cutout_aspect,
             'hem', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.hem_ratio end,
             'waist', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.waist_ratio end,
             'collar', case when p.collar_src = p.cutout_url then p.collar_ratio end,
             'hood', case when p.hood_src = p.feed_image_url then p.has_hood end,
             'fill', p.shape_fill, 'presentation', case when p.presentation_src = p.feed_image_url then p.presentation end,
             'cutout', p.cutout_url, 'image', p.feed_image_url, 'url', o.url, 'price_cents', o.price_cents, 'compare_at_cents', o.compare_at_cents, 'currency', o.currency) x
      from products p
      join lateral (select * from offers o2 where o2.product_id = p.id and o2.availability = 'in_stock' order by o2.price_cents nulls last limit 1) o on true
     where p.status = 'active' and p.feed_ready and p.feed_slot in ('top','bottom','shoes','full_body','accessory')
       and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url and p.cutout_aspect is not null
       and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url and p.is_single_product
       and (p.feed_slot in ('shoes','full_body','accessory')
            or (p.measure_status = 'ok' and p.measure_src = p.cutout_url and ((p.feed_slot = 'top' and p.hem_ratio is not null) or (p.feed_slot = 'bottom' and p.waist_ratio is not null))))
       and p.id > p_after
     order by p.id limit least(p_limit, 1000)) t;
$$;
