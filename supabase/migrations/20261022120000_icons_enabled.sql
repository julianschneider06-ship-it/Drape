-- Switch for the small attribute icons on outfit cards (true | false). Insert only; ?icons=0 turns them off per link.
insert into public.app_settings (key, value, updated_by) values ('icons_enabled', 'true', 'migration') on conflict (key) do nothing;
