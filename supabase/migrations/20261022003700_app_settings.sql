-- App settings: a few switches the owner can change in the database without a deployment. Server-only: RLS on, no public policy.
-- The web app reads them through settings_get() (service-role function behind the pipeline gateway) and caches them in memory for 45 s.
-- Written only through the owner's Supabase connection (update app_settings set value = '"hybrid"' where key = 'feed_default'); the code validates every value.
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value, updated_by) values
  ('feed_default', '"base"', 'migration'),          -- allowed: "base" | "dynamic" | "hybrid"
  ('sale_marker_enabled', 'true', 'migration')     -- allowed: true | false
on conflict (key) do nothing;

create or replace function public.settings_get() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings;
$$;
revoke all on function public.settings_get() from public, anon, authenticated;
grant execute on function public.settings_get() to service_role;

insert into public.pipeline_rpc_allowlist (fn) values ('settings_get') on conflict do nothing;
update public.pipeline_tokens set allowed_fns = allowed_fns || array['settings_get']
 where label = 'vercel-sample-page' and not ('settings_get' = any (allowed_fns));
