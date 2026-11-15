-- dash_visitors_daily: one row per Brisbane calendar day (Australia/Brisbane, UTC+10, no DST), from 2026-11-15, newest first. No personal data: built only on the events table (device ids stay inside the view).
-- Definitions (also in docs/analytics.md):
--   ts: client_ts if it is within 10 minutes of created_at (99.99% of events are within 60 s), else created_at.
--   excluded: devices in app_settings.popularity_exclude_devices, and synthetic ids whose first 8 characters are one repeated hex character.
--   devices_all: distinct non-excluded devices with >= 1 event that day.
--   devices_real: devices with >= 3 events and >= 5 s between first and last event that day (the main "visitors" number).
--   sessions: per device, consecutive events < 3 minutes apart belong to one session; a session belongs to the day of its first event; counted for devices_real only.
--   session_seconds: last - first event of the session + 10 s, capped at 3600; total_active_minutes sums it over real devices.
--   new_devices: first ever (non-excluded) event of the device is on this day; returning_devices = devices_all - new_devices.
--   shop_clicks / shop_click_devices: event_type view_product_click, non-excluded devices. click_log_clicks: all click_log rows that day (includes excluded devices).
create or replace view public.dash_visitors_daily with (security_invoker = true) as
with excl as (
  select x::uuid as id
    from public.app_settings s
   cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.value) = 'array' then s.value else '[]'::jsonb end) x
   where s.key = 'popularity_exclude_devices' and x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
ev as (
  select e.device_id, e.event_type,
         case when e.client_ts is not null and abs(extract(epoch from e.created_at - e.client_ts)) <= 600 then e.client_ts else e.created_at end as ts
    from public.events e
   where e.device_id::text !~ '^([0-9a-f])\1{7}-'
     and not exists (select 1 from excl x where x.id = e.device_id)
),
evd as (select *, (ts at time zone 'Australia/Brisbane')::date as day from ev),
first_seen as (select device_id, min(day) as first_day from evd group by 1),
dd as (
  select day, device_id, count(*) as n, extract(epoch from max(ts) - min(ts)) as span
    from evd where day >= date '2026-11-15' group by 1, 2
),
gaps as (
  select device_id, ts, day,
         case when lag(ts) over w is null or ts - lag(ts) over w >= interval '3 minutes' then 1 else 0 end as new_s
    from evd
   window w as (partition by device_id order by ts)
),
sess as (
  select device_id, sid, min(ts) as s0, max(ts) as s1
    from (select *, sum(new_s) over (partition by device_id order by ts) as sid from gaps) g
   group by 1, 2
),
sess_d as (
  select (s0 at time zone 'Australia/Brisbane')::date as day, s.device_id,
         least(3600, extract(epoch from s1 - s0) + 10) as secs
    from sess s
),
per_day as (
  select d.day,
         count(*) as devices_all,
         count(*) filter (where d.n >= 3 and d.span >= 5) as devices_real,
         count(*) filter (where f.first_day = d.day) as new_devices
    from dd d join first_seen f using (device_id)
   group by 1
),
sess_agg as (
  select sd.day, count(*) as sessions, sum(sd.secs) as secs
    from sess_d sd join dd d on d.day = sd.day and d.device_id = sd.device_id and d.n >= 3 and d.span >= 5
   group by 1
),
clicks as (
  select day, count(*) as shop_clicks, count(distinct device_id) as shop_click_devices
    from evd where event_type = 'view_product_click' and day >= date '2026-11-15' group by 1
),
cl as (
  select (created_at at time zone 'Australia/Brisbane')::date as day, count(*) as n
    from public.click_log group by 1
)
select s.day,
       coalesce(p.devices_all, 0) as devices_all,
       coalesce(p.devices_real, 0) as devices_real,
       coalesce(p.new_devices, 0) as new_devices,
       coalesce(p.devices_all, 0) - coalesce(p.new_devices, 0) as returning_devices,
       coalesce(a.sessions, 0) as sessions,
       round(coalesce(a.secs, 0) / 60.0, 1) as total_active_minutes,
       round(coalesce(a.secs, 0) / 60.0 / nullif(p.devices_real, 0), 2) as avg_minutes_per_device,
       round(coalesce(a.secs, 0) / 60.0 / nullif(a.sessions, 0), 2) as avg_minutes_per_session,
       coalesce(c.shop_clicks, 0) as shop_clicks,
       coalesce(c.shop_click_devices, 0) as shop_click_devices,
       coalesce(l.n, 0) as click_log_clicks
  from generate_series(date '2026-11-15', (now() at time zone 'Australia/Brisbane')::date, interval '1 day') g(d)
 cross join lateral (select g.d::date as day) s
  left join per_day p on p.day = s.day
  left join sess_agg a on a.day = s.day
  left join clicks c on c.day = s.day
  left join cl l on l.day = s.day
 order by s.day desc;
revoke all on public.dash_visitors_daily from anon, authenticated;
