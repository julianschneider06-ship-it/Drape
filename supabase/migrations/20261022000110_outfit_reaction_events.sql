-- Outfit-level signals: outfit_up / outfit_down (+ outfit_clear = the user removed their reaction). Signal only, no effect on ranking yet.
-- Allowed event types are extended in the table check and in events_append. ctx carries the layout context (layout id, mode, canvas).
alter table public.events drop constraint events_event_type_check;
alter table public.events add constraint events_event_type_check check (event_type in
  ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear'));

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
     where e.event_type in ('impression','dwell_ms','like','unlike','tap_product','view_product_click','scroll_past','outfit_up','outfit_down','outfit_clear')
     limit 100
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;
