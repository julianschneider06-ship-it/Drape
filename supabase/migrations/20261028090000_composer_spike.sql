-- Dynamic composer spike (prototype, behind ?feed=dynamic). Nothing here touches outfit_pool or the default feed.

-- 1) Everything the composer needs per eligible piece besides the classification (which comes from outfit_inputs / acc_inputs):
--    brand, name, cutout aspect, measurements, presentation. Eligible = feed ready, clean cutout, single product, measurements for tops / bottoms.
create function public.composer_inputs(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'aspect', p.cutout_aspect,
             'hem', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.hem_ratio end,
             'waist', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.waist_ratio end,
             'collar', case when p.collar_src = p.cutout_url then p.collar_ratio end,
             'hood', case when p.hood_src = p.feed_image_url then p.has_hood end,
             'fill', p.shape_fill, 'presentation', case when p.presentation_src = p.feed_image_url then p.presentation end) x
      from products p
     where p.status = 'active' and p.feed_ready and p.feed_slot in ('top','bottom','shoes','full_body','accessory')
       and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url and p.cutout_aspect is not null
       and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url and p.is_single_product
       and (p.feed_slot in ('shoes','full_body','accessory')
            or (p.measure_status = 'ok' and p.measure_src = p.cutout_url and ((p.feed_slot = 'top' and p.hem_ratio is not null) or (p.feed_slot = 'bottom' and p.waist_ratio is not null))))
       and p.id > p_after
     order by p.id limit least(p_limit, 1000)) t;
$$;

-- 2) Catalogue snapshot: one gzip+base64 blob built by a background job, loaded once per function instance (version stamp = refresh check).
create table public.catalogue_snapshot (
  id bigint generated always as identity primary key,
  version text not null,
  n_pieces integer not null,
  data text not null,                 -- base64(gzip(json))
  created_at timestamptz not null default now()
);
alter table public.catalogue_snapshot enable row level security;
revoke all on public.catalogue_snapshot from anon, authenticated;
create function public.snapshot_put(p_version text, p_n integer, p_data text) returns bigint language sql set search_path = public as $$
  insert into catalogue_snapshot (version, n_pieces, data) values (p_version, p_n, p_data) returning id;
$$;
create function public.snapshot_get(p_known_version text default null) returns jsonb language sql stable set search_path = public as $$
  select case when s.version = p_known_version then jsonb_build_object('version', s.version, 'unchanged', true)
              else jsonb_build_object('version', s.version, 'n', s.n_pieces, 'data', s.data) end
    from (select * from catalogue_snapshot order by id desc limit 1) s;
$$;

-- 3) Per-device ban list (recently served single products): one small blob per device (int32 ids, oldest first).
create table public.device_bans (
  device_id  uuid primary key,
  bans       bytea not null,
  updated_at timestamptz not null default now()
);
create index device_bans_updated_idx on public.device_bans (updated_at);   -- cleanup / archive of inactive devices
alter table public.device_bans enable row level security;
revoke all on public.device_bans from anon, authenticated;
create function public.ban_get(p_device uuid) returns text language sql stable set search_path = public as $$
  select encode(bans, 'base64') from device_bans where device_id = p_device;
$$;
create function public.ban_put(p_device uuid, p_b64 text) returns void language sql set search_path = public as $$
  insert into device_bans (device_id, bans) values (p_device, decode(p_b64, 'base64'))
  on conflict (device_id) do update set bans = excluded.bans, updated_at = now();
$$;

-- 4) Starter set (fixed table, served first, CDN-cacheable)
create table public.starter_outfits (
  id         bigint generated always as identity primary key,
  gender     text not null check (gender in ('women','men')),
  ord        integer not null,
  kind       text not null,
  piece_ids  integer[] not null,        -- top, bottom (absent for full), shoes
  acc_ids    integer[] not null default '{}',
  score      real not null,
  style      text not null,
  contrast   boolean not null default false,
  outfit_hash bigint not null,
  version    text not null,
  unique (gender, ord, version)
);
alter table public.starter_outfits enable row level security;
revoke all on public.starter_outfits from anon, authenticated;
create function public.starter_put(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into starter_outfits (gender, ord, kind, piece_ids, acc_ids, score, style, contrast, outfit_hash, version)
  select i.gender, i.ord, i.kind, i.piece_ids, coalesce(i.acc_ids, '{}'), i.score, i.style, coalesce(i.contrast, false), i.outfit_hash, i.version
    from jsonb_to_recordset(p_items) as i(gender text, ord integer, kind text, piece_ids integer[], acc_ids integer[], score real, style text, contrast boolean, outfit_hash bigint, version text)
  on conflict (gender, ord, version) do nothing;
  get diagnostics n = row_count; return n;
end $$;
create function public.starter_list(p_gender text) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ord', s.ord, 'kind', s.kind, 'piece_ids', s.piece_ids, 'acc_ids', s.acc_ids, 'score', s.score, 'style', s.style, 'contrast', s.contrast, 'hash', s.outfit_hash) order by s.ord), '[]'::jsonb)
    from starter_outfits s
   where s.gender = p_gender and s.version = (select version from starter_outfits order by id desc limit 1);
$$;

-- 5) Cards for a list of product ids (the dynamic feed returns ids from the composer; cards come from here, same shape as the feed pages)
create function public.cards_by_ids(p_ids bigint[]) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', i.id, 'card', public.product_card(i.id, true),
           'acc', case when p.feed_slot = 'accessory' then jsonb_build_object('type', p.accessory_type, 'size', p.size_class, 'front_flat', p.front_flat, 'belt_shape', p.belt_shape) end))), '[]'::jsonb)
    from unnest(p_ids) as i(id) join products p on p.id = i.id;
$$;

revoke all on function public.composer_inputs(bigint, integer), public.snapshot_put(text, integer, text), public.snapshot_get(text), public.ban_get(uuid), public.ban_put(uuid, text),
  public.starter_put(jsonb), public.starter_list(text), public.cards_by_ids(bigint[]) from public, anon, authenticated;
grant execute on function public.composer_inputs(bigint, integer), public.snapshot_put(text, integer, text), public.snapshot_get(text), public.ban_get(uuid), public.ban_put(uuid, text),
  public.starter_put(jsonb), public.starter_list(text), public.cards_by_ids(bigint[]) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('composer_inputs'), ('snapshot_put'), ('snapshot_get'), ('ban_get'), ('ban_put'), ('starter_put'), ('starter_list'), ('cards_by_ids') on conflict do nothing;
-- the web token (read / write of its own small state only): the dynamic prototype route uses these
update public.pipeline_tokens set allowed_fns = allowed_fns || array['snapshot_get','ban_get','ban_put','starter_list','cards_by_ids']::text[]
 where label like 'vercel%' and not ('snapshot_get' = any (allowed_fns));
