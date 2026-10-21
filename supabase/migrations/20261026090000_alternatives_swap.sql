-- Swap a piece: precomputed alternatives per outfit and slot (background job), swap event type, web access to the lookup.
create table public.outfit_alternatives (
  outfit_id      bigint not null,
  slot_key       text not null,            -- top | bottom | shoes | acc1 | acc2 | acc3   (top = the dress in full-body outfits)
  rank           smallint not null,        -- 1 = best alternative
  product_id     bigint not null,
  score          real not null,
  scorer_version text not null,
  active         boolean not null default true,
  built_at       timestamptz not null default now(),
  primary key (outfit_id, slot_key, rank)
);
create index outfit_alternatives_product_idx on public.outfit_alternatives (product_id);
alter table public.outfit_alternatives enable row level security;
revoke all on public.outfit_alternatives from anon, authenticated;

-- One row per outfit: hash of the inputs the alternatives were computed from (pieces, accessories, eligible candidate set, scorer version).
create table public.outfit_alt_state (
  outfit_id  bigint primary key,
  input_hash text not null,
  built_at   timestamptz not null default now()
);
alter table public.outfit_alt_state enable row level security;
revoke all on public.outfit_alt_state from anon, authenticated;

create function public.alt_state_list(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('outfit_id', outfit_id, 'input_hash', input_hash) order by outfit_id), '[]'::jsonb)
    from (select * from outfit_alt_state where outfit_id > p_after order by outfit_id limit least(p_limit, 5000)) t;
$$;

-- items: [{outfit_id, input_hash, version, slots: [{slot_key, alts: [{product_id, score}]}]}]  (idempotent: upsert by (outfit, slot, rank), surplus old ranks are switched off)
create function public.alt_upsert(p_items jsonb) returns integer language plpgsql set search_path = public as $$
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
    insert into outfit_alt_state (outfit_id, input_hash) values ((it->>'outfit_id')::bigint, it->>'input_hash')
      on conflict (outfit_id) do update set input_hash = excluded.input_hash, built_at = now();
  end loop;
  return n;
end $$;

-- Eligible main pieces with what the alternatives job needs besides the classification: brand, presentation, fill, measurements.
create function public.alt_pieces(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'brand', p.brand, 'slot', p.feed_slot,
             'presentation', case when p.presentation_src = p.feed_image_url then p.presentation end, 'fill', p.shape_fill) x
      from products p
     where p.status = 'active' and p.feed_ready and p.feed_slot in ('top','bottom','shoes','full_body')
       and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url
       and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url and p.is_single_product
       and (p.feed_slot in ('shoes','full_body')
            or (p.measure_status = 'ok' and p.measure_src = p.cutout_url and ((p.feed_slot = 'top' and p.hem_ratio is not null) or (p.feed_slot = 'bottom' and p.waist_ratio is not null))))
       and p.id > p_after
     order by p.id limit least(p_limit, 1000)) t;
$$;

-- Accessories of the outfits in the pool (cache table outfit_accessories).
create function public.outfit_acc_all(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('outfit_id', outfit_id, 'slot_no', slot_no, 'product_id', product_id, 'type', accessory_type, 'zone', zone) order by outfit_id, slot_no), '[]'::jsonb)
    from (select * from outfit_accessories where outfit_id > p_after order by outfit_id, slot_no limit least(p_limit, 5000)) t;
$$;

-- Lookup for the web app (lazy, on the first swipe on a piece): the alternatives as feed cards, best first.
create function public.alternatives_list(p_outfit bigint, p_slot text) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', a.rank, 'card', public.product_card(a.product_id, true)) order by a.rank), '[]'::jsonb)
    from outfit_alternatives a
   where a.outfit_id = p_outfit and a.slot_key = p_slot and a.active and public.product_card(a.product_id, true) is not null;
$$;

-- swap = a new event type in the same append-only log (details in ctx: out / dir / rank)
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in
  ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear','swap'));
create or replace function public.events_append(p_device uuid, p_events jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with ins as (
    insert into events (device_id, event_type, product_id, product_ids, outfit_id, slot, feed_index, gender, dwell_ms, ctx, client_ts)
    select p_device, e.event_type, e.product_id, e.product_ids, e.outfit_id, e.slot, e.feed_index, e.gender, e.dwell_ms, e.ctx, e.client_ts
      from jsonb_to_recordset(case when jsonb_typeof(p_events) = 'array' then p_events else '[]'::jsonb end)
           as e(event_type text, product_id bigint, product_ids bigint[], outfit_id bigint, slot text, feed_index integer,
                gender text, dwell_ms integer, ctx jsonb, client_ts timestamptz)
     where e.event_type in ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear','swap')
     limit 100
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;

revoke all on function public.alt_state_list(bigint, integer), public.alt_upsert(jsonb), public.alt_pieces(bigint, integer), public.outfit_acc_all(bigint, integer), public.alternatives_list(bigint, text), public.events_append(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.alt_state_list(bigint, integer), public.alt_upsert(jsonb), public.alt_pieces(bigint, integer), public.outfit_acc_all(bigint, integer), public.alternatives_list(bigint, text), public.events_append(uuid, jsonb) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('alt_state_list'), ('alt_upsert'), ('alt_pieces'), ('outfit_acc_all'), ('alternatives_list') on conflict do nothing;
-- the restricted web token may look alternatives up
update public.pipeline_tokens set allowed_fns = array_append(allowed_fns, 'alternatives_list') where label like 'vercel%' and not ('alternatives_list' = any (allowed_fns));

-- alternatives_list also returns the accessory attributes (type, size, front_flat, belt_shape) so the layout can place a swapped accessory.
create or replace function public.alternatives_list(p_outfit bigint, p_slot text) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', a.rank, 'card', c.card,
           'meta', case when p.feed_slot = 'accessory' then jsonb_build_object('type', p.accessory_type, 'size', p.size_class, 'front_flat', p.front_flat, 'belt_shape', p.belt_shape) end) order by a.rank), '[]'::jsonb)
    from outfit_alternatives a
    join products p on p.id = a.product_id
    cross join lateral (select public.product_card(a.product_id, true) card) c
   where a.outfit_id = p_outfit and a.slot_key = p_slot and a.active and c.card is not null;
$$;
revoke all on function public.alternatives_list(bigint, text) from public, anon, authenticated;
grant execute on function public.alternatives_list(bigint, text) to service_role;
