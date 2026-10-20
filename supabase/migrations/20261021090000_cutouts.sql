-- Background removal ("cutout") of feed images: columns, worker RPCs, public-read bucket, card fields.
-- One result per product per (model, version); a changed feed image invalidates it (cutout_src).

alter table public.products
  add column cutout_url text,
  add column cutout_status text check (cutout_status in ('ok', 'failed')),
  add column cutout_reason text,
  add column cutout_model text,
  add column cutout_version integer,
  add column cutout_quality real,
  add column cutout_aspect real,      -- width / height of the cropped cutout file
  add column cutout_src text,         -- the feed_image_url that was processed
  add column cutout_at timestamptz;

create index products_cutout_todo_idx on public.products (feed_slot, id) where feed_ready and cutout_status is null;

-- Work list for a worker: next feed-ready products of one slot that still need (this model, this version).
-- p_shard/p_shards split the id space between parallel workers; p_retry_failed also re-picks failed ones.
create function public.cutout_todo(p_slot text, p_after bigint, p_limit integer, p_model text, p_version integer,
                                   p_shard integer default 0, p_shards integer default 1, p_retry_failed boolean default false)
returns table (id bigint, url text, slot text) language sql stable set search_path = public as $$
  select p.id, p.feed_image_url, p.feed_slot
    from products p
   where p.feed_ready and p.status = 'active' and p.feed_slot = p_slot and p.id > p_after and p.feed_image_url is not null
     and p.id % greatest(p_shards, 1) = p_shard
     and (p.cutout_status is null
          or p.cutout_model is distinct from p_model or p.cutout_version is distinct from p_version
          or p.cutout_src is distinct from p.feed_image_url
          or (p_retry_failed and p.cutout_status = 'failed'))
   order by p.id limit least(p_limit, 500);
$$;

create function public.cutout_apply(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update products p set cutout_status = i.status, cutout_url = i.url, cutout_reason = i.reason, cutout_model = i.model,
         cutout_version = i.version, cutout_quality = i.quality, cutout_aspect = i.aspect, cutout_src = i.src, cutout_at = now()
    from jsonb_to_recordset(p_items) as i(id bigint, status text, url text, reason text, model text, version integer, quality real, aspect real, src text)
   where p.id = i.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- Progress counts per slot and status (for reports).
create function public.cutout_stats() returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb) from (
    select feed_slot slot, coalesce(cutout_status, 'todo') status, coalesce(cutout_reason, '') reason, count(*) n
      from products where feed_ready and status = 'active' group by 1, 2, 3 order by 1, 2, 3) r;
$$;

revoke all on function public.cutout_todo(text, bigint, integer, text, integer, integer, integer, boolean), public.cutout_apply(jsonb), public.cutout_stats() from public, anon, authenticated;
grant execute on function public.cutout_todo(text, bigint, integer, text, integer, integer, integer, boolean), public.cutout_apply(jsonb), public.cutout_stats() to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('cutout_todo'), ('cutout_apply'), ('cutout_stats') on conflict do nothing;

-- Feed card: also carries the cutout (only when it belongs to the current feed image).
create or replace function public.product_card(p_id bigint, p_stock boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'image', p.feed_image_url,
           'bg', p.feed_bg_color, 'whiten', p.feed_whiten, 'bbox', case when p.feed_bbox_url = p.feed_image_url then to_jsonb(p.feed_bbox) end,
           'aspect', case when p.feed_bbox_url = p.feed_image_url then p.feed_aspect end,
           'cutout', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_url end,
           'cutout_aspect', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_aspect end,
           'price_cents', o.price_cents, 'compare_at_cents', o.compare_at_cents,
           'currency', o.currency, 'url', o.url, 'store', s.slug, 'in_stock', o.availability = 'in_stock')
    from products p
    join lateral (select * from offers o2 where o2.product_id = p.id and (not p_stock or o2.availability = 'in_stock')
                   order by (o2.availability = 'in_stock') desc, o2.price_cents nulls last limit 1) o on true
    join sources s on s.id = o.source_id
   where p.id = p_id and p.status = 'active' and (not p_stock or p.feed_ready);
$$;

-- Public-read bucket for the processed images (written only through the pipeline gateway's signed upload URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cutouts', 'cutouts', true, 5242880, array['image/webp', 'image/png'])
on conflict (id) do nothing;
