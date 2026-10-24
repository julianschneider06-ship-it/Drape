-- Switch for the custom accessory layout in Wishlist > My Outfits (frame, resize, vertical move). true | false. Off = the default layout (Prompt 60 look); stored layouts are kept, only ignored while off.
-- Insert only; ?customize=1 / ?customize=0 override it per link.
insert into public.app_settings (key, value, updated_by) values ('liked_outfit_customizable_enabled', 'false', 'migration') on conflict (key) do nothing;
