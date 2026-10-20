-- Feed pages are fixed windows of 6 outfits [6k, 6k+6) per gender, so a page is identical for every device and can be
-- cached at the CDN. The device only decides WHICH page a visit starts on (hash(device) -> page).
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
    v_start := (p_cursor / c_page) % v_pages * c_page;   -- snap any cursor to its page
  end if;
  with picked as (
    select o.* from outfit_pool o where o.gender = p_gender and o.active and o.feed_order >= v_start and o.feed_order < v_start + c_page
  ),
  cards as (
    select pk.id, pk.kind, pk.score, pk.feed_order,
           product_card(pk.top_id, true) top, case when pk.bottom_id = 0 then null else product_card(pk.bottom_id, true) end bottom,
           product_card(pk.shoes_id, true) shoes
      from picked pk)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'score', c.score, 'order', c.feed_order,
                  'top', c.top, 'bottom', c.bottom, 'shoes', c.shoes) order by c.feed_order), '[]'::jsonb)
    into v_items
    from cards c
   where c.top is not null and c.shoes is not null and (c.kind = 'full' or c.bottom is not null);
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_start + c_page >= v_n then 0 else v_start + c_page end, 'size', v_n);
end $$;
