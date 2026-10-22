-- Search tab: read-only index of the active pool outfits (ids + accessory rows; cards and tags come from the in-memory catalogue). Paged by pool id.
-- Women use the w2 accessory set (latest run), men the old set, same as the live feed. No writes, no scans beyond the pool.
create or replace function public.search_index(p_gender text, p_after bigint, p_limit integer) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_run integer; v_out jsonb;
begin
  select max(run_id) into v_run from outfit_accessories_w2;
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) into v_out from (
    select jsonb_build_object('id', o.id, 'k', o.kind, 't', o.top_id, 'b', o.bottom_id, 's', o.shoes_id, 'sc', o.score, 'st', o.style_key,
      'a', (select coalesce(jsonb_agg(jsonb_build_object('p', a.product_id, 'ty', a.accessory_type, 'pl', a.placement, 'z', a.zone, 'n', a.slot_no) order by a.slot_no), '[]'::jsonb)
              from (select outfit_id, slot_no, product_id, accessory_type, placement, zone from outfit_accessories_w2 where p_gender = 'women' and run_id = v_run
                    union all
                    select outfit_id, slot_no, product_id, accessory_type, placement, zone from outfit_accessories where p_gender <> 'women') a
             where a.outfit_id = o.id)) x
      from outfit_pool o where o.gender = p_gender and o.active and o.id > coalesce(p_after, 0) order by o.id limit least(greatest(coalesce(p_limit, 1000), 1), 1500)) t;
  return v_out;
end $$;
revoke all on function public.search_index(text, bigint, integer) from public, anon, authenticated;
grant execute on function public.search_index(text, bigint, integer) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('search_index') on conflict do nothing;
update public.pipeline_tokens set allowed_fns = allowed_fns || array['search_index'] where label = 'vercel-sample-page' and not ('search_index' = any(allowed_fns));

-- Switch for the Search tab and the bottom bar (true | false). Insert only; ?search=0 turns them off per link.
insert into public.app_settings (key, value, updated_by) values ('search_enabled', 'true', 'migration') on conflict (key) do nothing;

-- Search usage in the same append-only event log (no personal data: family / item / season / extra only, in ctx).
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in
  ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear','swap','search_started','search_submitted')) not valid;

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
     where e.event_type in ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear','swap','search_started','search_submitted')
     limit 100
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;
