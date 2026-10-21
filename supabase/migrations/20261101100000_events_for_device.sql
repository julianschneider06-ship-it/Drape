-- Replay of one device's events (taste rebuild / sync, /taste debug page): uses events_device_time_idx (device_id, created_at), no full scan.
create or replace function public.events_for_device(p_device uuid, p_gender text, p_after timestamptz, p_limit integer) returns jsonb language sql stable set search_path to 'public' as $f$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 't', e.event_type, 'p', e.product_id, 'o', e.product_ids, 'out', e.outfit_id, 'd', e.dwell_ms, 'ctx', e.ctx, 'at', e.created_at) order by e.created_at, e.id), '[]'::jsonb)
    from (select * from events where device_id = p_device and (p_gender is null or gender = p_gender) and created_at > coalesce(p_after, '-infinity'::timestamptz)
           order by created_at, id limit least(p_limit, 5000)) e;
$f$;
revoke all on function public.events_for_device(uuid, text, timestamptz, integer) from public, anon, authenticated;
insert into pipeline_rpc_allowlist (fn) select 'events_for_device' where not exists (select 1 from pipeline_rpc_allowlist where fn = 'events_for_device');
-- the web token may read it (debug page /taste?device=...): read-only; see docs/security-backlog.md
update pipeline_tokens set allowed_fns = allowed_fns || array['events_for_device'] where label = 'vercel-sample-page' and not ('events_for_device' = any(allowed_fns));
