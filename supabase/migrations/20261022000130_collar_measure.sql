-- Collar / neck width of tops and full-body pieces (ratio of the cutout file width), used to size head items.
alter table public.products add column if not exists collar_ratio real, add column if not exists collar_src text;

create or replace function public.measure_todo(p_after bigint, p_limit integer)
returns table (id bigint, slot text, url text) language sql stable set search_path = public as $$
  select p.id, p.feed_slot, p.cutout_url from products p
   where p.cutout_status = 'ok' and p.feed_slot in ('top', 'bottom', 'full_body') and p.cutout_src = p.feed_image_url
     and (p.measure_src is distinct from p.cutout_url or (p.feed_slot in ('top', 'full_body') and p.collar_src is distinct from p.cutout_url))
     and p.id > p_after
   order by p.id limit least(p_limit, 500);
$$;

create or replace function public.measure_apply(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update products p set measure_src = i.src, measure_status = i.status, measure_reason = i.reason,
         hem_ratio = i.hem, waist_ratio = i.waist, shape_fill = i.fill, collar_ratio = i.collar, collar_src = i.src
    from jsonb_to_recordset(p_items) as i(id bigint, src text, status text, reason text, hem real, waist real, fill real, collar real)
   where p.id = i.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.product_card(p_id bigint, p_stock boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'image', p.feed_image_url,
           'bg', p.feed_bg_color, 'whiten', p.feed_whiten, 'bbox', case when p.feed_bbox_url = p.feed_image_url then to_jsonb(p.feed_bbox) end,
           'aspect', case when p.feed_bbox_url = p.feed_image_url then p.feed_aspect end,
           'cutout', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_url end,
           'cutout_aspect', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_aspect end,
           'presentation', case when p.presentation_src = p.feed_image_url then p.presentation end,
           'hem', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.hem_ratio end,
           'waist', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.waist_ratio end,
           'collar', case when p.collar_src = p.cutout_url then p.collar_ratio end,
           'fill', case when p.measure_src = p.cutout_url then p.shape_fill end,
           'price_cents', o.price_cents, 'compare_at_cents', o.compare_at_cents,
           'currency', o.currency, 'url', o.url, 'store', s.slug, 'in_stock', o.availability = 'in_stock')
    from products p
    join lateral (select * from offers o2 where o2.product_id = p.id and (not p_stock or o2.availability = 'in_stock')
                   order by (o2.availability = 'in_stock') desc, o2.price_cents nulls last limit 1) o on true
    join sources s on s.id = o.source_id
   where p.id = p_id and p.status = 'active' and (not p_stock or p.feed_ready);
$$;
revoke all on function public.measure_todo(bigint, integer), public.measure_apply(jsonb), public.product_card(bigint, boolean) from public, anon, authenticated;
grant execute on function public.measure_todo(bigint, integer), public.measure_apply(jsonb), public.product_card(bigint, boolean) to service_role;
