-- Swap loop: the feed page carries the two alternatives (rank 1 and 2) of every swappable piece, so a swipe needs no request.
-- Cards are null-stripped (compact); accessories also carry their slot number so alternatives map to the right accessory.
create or replace function public.feed_list(p_gender text, p_device text, p_cursor integer, p_limit integer) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  c_page constant integer := 6;
  v_n integer; v_pages integer; v_start integer; v_items jsonb;
begin
  select coalesce(max(feed_order), -1) + 1 into v_n from outfit_pool where gender = p_gender and active;
  if v_n = 0 then return jsonb_build_object('items', '[]'::jsonb, 'next_cursor', 0, 'size', 0); end if;
  v_pages := (v_n + c_page - 1) / c_page;
  if p_cursor is null then
    v_start := ((hashtextextended(coalesce(p_device, ''), 0) & 2147483647) % v_pages)::integer * c_page;
  else
    v_start := (p_cursor / c_page) % v_pages * c_page;
  end if;
  with picked as (
    select o.* from outfit_pool o where o.gender = p_gender and o.active and o.feed_order >= v_start and o.feed_order < v_start + c_page
  ),
  cards as (
    select pk.id, pk.kind, pk.score, pk.feed_order,
           product_card(pk.top_id, true) top, case when pk.bottom_id = 0 then null else product_card(pk.bottom_id, true) end bottom,
           product_card(pk.shoes_id, true) shoes,
           (select coalesce(jsonb_agg(jsonb_build_object('card', product_card(a.product_id, true), 'type', a.accessory_type, 'placement', a.placement,
                     'zone', a.zone, 'size', pr.size_class, 'front_flat', pr.front_flat, 'belt_shape', pr.belt_shape, 'slot_no', a.slot_no) order by a.slot_no), '[]'::jsonb)
              from outfit_accessories a join products pr on pr.id = a.product_id
             where a.outfit_id = pk.id and product_card(a.product_id, true) is not null) accessories,
           (select coalesce(jsonb_object_agg(g.slot_key, g.arr), '{}'::jsonb) from (
              select a.slot_key, jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rank', a.rank, 'card', c.card,
                       'meta', case when p.feed_slot = 'accessory' then jsonb_build_object('type', p.accessory_type, 'size', p.size_class, 'front_flat', p.front_flat, 'belt_shape', p.belt_shape) end)) order by a.rank) arr
                from outfit_alternatives a
                join products p on p.id = a.product_id
                cross join lateral (select jsonb_strip_nulls(product_card(a.product_id, true)) card) c
               where a.outfit_id = pk.id and a.active and a.rank <= 2 and c.card is not null
               group by a.slot_key) g) alts
      from picked pk)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'score', c.score, 'order', c.feed_order,
                  'top', c.top, 'bottom', c.bottom, 'shoes', c.shoes, 'accessories', c.accessories, 'alts', c.alts) order by c.feed_order), '[]'::jsonb)
    into v_items
    from cards c
   where c.top is not null and c.shoes is not null and (c.kind = 'full' or c.bottom is not null);
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_start + c_page >= v_n then 0 else v_start + c_page end, 'size', v_n);
end $$;
revoke all on function public.feed_list(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.feed_list(text, text, integer, integer) to service_role;
