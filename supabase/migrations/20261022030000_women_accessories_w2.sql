-- Women's accessory set, revision "w2": more accessories per outfit (up to 8 slots). Lives NEXT TO outfit_accessories (nothing there is touched),
-- so the live feed keeps the old set until the preview is approved. Insert-only: a rebuild gets a new run_id, readers use the latest run (no deletes, no flags).
create table public.outfit_accessories_w2 (
  outfit_id bigint not null,
  slot_no smallint not null check (slot_no between 1 and 8),
  product_id bigint not null,
  accessory_type text not null,
  placement text not null check (placement in ('head', 'inline', 'side')),
  zone text,
  score real,
  run_id integer not null,
  primary key (outfit_id, slot_no)
);
alter table public.outfit_accessories_w2 enable row level security;
revoke all on public.outfit_accessories_w2 from anon, authenticated;
create index outfit_accessories_w2_run_idx on public.outfit_accessories_w2 (run_id);

create function public.outfit_acc_w2_run_next() returns integer language sql set search_path = public as $$ select (coalesce(max(run_id), 0) + 1)::integer from outfit_accessories_w2; $$;

-- A run writes a complete set of rows; rows of earlier runs stay but are ignored by every reader (latest run only).
create function public.outfit_acc_w2_upsert(p_run integer, p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into outfit_accessories_w2 (outfit_id, slot_no, product_id, accessory_type, placement, zone, score, run_id)
  select i.outfit_id, i.slot_no, i.product_id, i.accessory_type, i.placement, i.zone, i.score, p_run
    from jsonb_to_recordset(p_items) as i(outfit_id bigint, slot_no integer, product_id bigint, accessory_type text, placement text, zone text, score real)
  on conflict (outfit_id, slot_no) do update set product_id = excluded.product_id, accessory_type = excluded.accessory_type, placement = excluded.placement,
       zone = excluded.zone, score = excluded.score, run_id = excluded.run_id;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.outfit_acc_w2_all(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('outfit_id', outfit_id, 'slot_no', slot_no, 'product_id', product_id, 'type', accessory_type, 'zone', zone) order by outfit_id, slot_no), '[]'::jsonb)
    from (select * from outfit_accessories_w2 where run_id = (select max(run_id) from outfit_accessories_w2) and outfit_id > p_after order by outfit_id, slot_no limit least(p_limit, 5000)) t;
$$;

-- Alternatives of the w2 accessory slots: stored in outfit_alternatives under slot keys w2acc1..w2acc8 (the old acc1..acc3 rows stay for the live feed). No alt_state row (that table is keyed by outfit only).
create function public.alt_upsert_slots(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer := 0; it jsonb; sl jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    for sl in select * from jsonb_array_elements(it->'slots') loop
      insert into outfit_alternatives (outfit_id, slot_key, rank, product_id, score, scorer_version, active)
      select (it->>'outfit_id')::bigint, sl->>'slot_key', (a.ord)::smallint, (a.elem->>'product_id')::bigint, (a.elem->>'score')::real, it->>'version', true
        from jsonb_array_elements(sl->'alts') with ordinality as a(elem, ord)
      on conflict (outfit_id, slot_key, rank) do update set product_id = excluded.product_id, score = excluded.score, scorer_version = excluded.scorer_version, active = true, built_at = now();
      update outfit_alternatives set active = false
       where outfit_id = (it->>'outfit_id')::bigint and slot_key = sl->>'slot_key' and rank > jsonb_array_length(sl->'alts') and active;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Feed page with the w2 accessories (women only; copy of feed_list with the accessory source and alternative keys swapped). Used by /api/feed?accrev=2.
create function public.feed_list_w2(p_gender text, p_device text, p_cursor integer, p_limit integer) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  c_page constant integer := 6;
  v_n integer; v_pages integer; v_start integer; v_items jsonb; v_run integer;
begin
  select max(run_id) into v_run from outfit_accessories_w2;
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
              from outfit_accessories_w2 a join products pr on pr.id = a.product_id
             where a.outfit_id = pk.id and a.run_id = v_run and product_card(a.product_id, true) is not null) accessories,
           (select coalesce(jsonb_object_agg(g.slot_key, g.arr), '{}'::jsonb) from (
              select case when a.slot_key like 'w2acc%' then substr(a.slot_key, 3) else a.slot_key end slot_key,
                     jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rank', a.rank, 'card', c.card,
                       'meta', case when p.feed_slot = 'accessory' then jsonb_build_object('type', p.accessory_type, 'size', p.size_class, 'front_flat', p.front_flat, 'belt_shape', p.belt_shape) end)) order by a.rank) arr
                from outfit_alternatives a
                join products p on p.id = a.product_id
                cross join lateral (select jsonb_strip_nulls(product_card(a.product_id, true)) card) c
               where a.outfit_id = pk.id and a.active and a.rank <= 2 and c.card is not null and a.slot_key not like 'acc%'
               group by 1) g) alts
      from picked pk)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'score', c.score, 'order', c.feed_order,
                  'top', c.top, 'bottom', c.bottom, 'shoes', c.shoes, 'accessories', c.accessories, 'alts', c.alts) order by c.feed_order), '[]'::jsonb)
    into v_items
    from cards c
   where c.top is not null and c.shoes is not null and (c.kind = 'full' or c.bottom is not null);
  return jsonb_build_object('items', v_items, 'next_cursor', case when v_start + c_page >= v_n then 0 else v_start + c_page end, 'size', v_n);
end $$;

do $$ declare fn text; begin
  foreach fn in array array['outfit_acc_w2_run_next()', 'outfit_acc_w2_upsert(integer,jsonb)', 'outfit_acc_w2_all(bigint,integer)', 'alt_upsert_slots(jsonb)', 'feed_list_w2(text,text,integer,integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- Gateway: callable functions are data. The web token may read the w2 feed; batch tokens get the builders (they list their functions themselves).
insert into public.pipeline_rpc_allowlist (fn) values ('outfit_acc_w2_run_next'), ('outfit_acc_w2_upsert'), ('outfit_acc_w2_all'), ('alt_upsert_slots'), ('feed_list_w2') on conflict do nothing;
update public.pipeline_tokens set allowed_fns = allowed_fns || array['feed_list_w2'] where expires_at is null and not ('feed_list_w2' = any(allowed_fns));
