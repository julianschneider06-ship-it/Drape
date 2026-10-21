-- Layout v3 data: how a garment is presented (spread_front | folded | other) and measurements of the cutout mask.

alter table public.products
  add column presentation text check (presentation in ('spread_front', 'folded', 'other')),
  add column presentation_src text,       -- the feed_image_url that was judged
  add column measure_src text,            -- the cutout_url that was measured
  add column measure_status text check (measure_status in ('ok', 'failed')),
  add column measure_reason text,
  add column hem_ratio real,              -- tops: body width at the lower edge / bounding-box width of the cutout
  add column waist_ratio real,            -- bottoms: width at the upper edge / bounding-box width
  add column shape_fill real;             -- mask area / bounding-box area (geometry hint: folded garments are compact rectangles)

create table public.product_presentation_checks (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id),
  image_url text not null, model text not null,
  presentation text not null, confidence real, cost_usd numeric(10, 6), created_at timestamptz not null default now(),
  unique (product_id, image_url, model)
);
alter table public.product_presentation_checks enable row level security;
revoke all on public.product_presentation_checks from anon, authenticated;

-- Backfill work list: products with a passed image check whose current image has no presentation yet.
create function public.presentation_todo(p_after bigint, p_limit integer)
returns table (id bigint, slot text, url text, checked_url text) language sql stable set search_path = public as $$
  select p.id, p.feed_slot, p.feed_image_url, p.cutout_url
    from products p
   where p.status = 'active' and p.feed_slot in ('top', 'bottom', 'full_body') and p.id > p_after
     and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url
     and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url
     and p.presentation_src is distinct from p.feed_image_url
   order by p.id limit least(p_limit, 500);
$$;

create function public.presentation_apply(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  insert into product_presentation_checks (product_id, image_url, model, presentation, confidence, cost_usd)
  select i.id, i.src, i.model, i.presentation, i.confidence, i.cost
    from jsonb_to_recordset(p_items) as i(id bigint, src text, model text, presentation text, confidence real, cost numeric)
  on conflict (product_id, image_url, model) do update set presentation = excluded.presentation, confidence = excluded.confidence, cost_usd = excluded.cost_usd, created_at = now();
  update products p set presentation = i.presentation, presentation_src = i.src
    from jsonb_to_recordset(p_items) as i(id bigint, src text, presentation text)
   where p.id = i.id and p.feed_image_url = i.src;
  get diagnostics n = row_count;
  return n;
end $$;

create function public.presentation_cost() returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from product_presentation_checks;
$$;

-- Mask measurements job.
create function public.measure_todo(p_after bigint, p_limit integer)
returns table (id bigint, slot text, url text) language sql stable set search_path = public as $$
  select p.id, p.feed_slot, p.cutout_url from products p
   where p.cutout_status = 'ok' and p.feed_slot in ('top', 'bottom', 'full_body') and p.cutout_src = p.feed_image_url
     and p.measure_src is distinct from p.cutout_url and p.id > p_after
   order by p.id limit least(p_limit, 500);
$$;

create function public.measure_apply(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update products p set measure_src = i.src, measure_status = i.status, measure_reason = i.reason,
         hem_ratio = i.hem, waist_ratio = i.waist, shape_fill = i.fill
    from jsonb_to_recordset(p_items) as i(id bigint, src text, status text, reason text, hem real, waist real, fill real)
   where p.id = i.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- image_check_apply: the check now also returns the presentation (stored when the image passes).
create or replace function public.image_check_apply(p_items jsonb) returns jsonb language plpgsql set search_path = public as $$
declare
  r record; cand text; n_pass integer := 0; n_switch integer := 0; n_excl integer := 0; v_verdict text; v_reason text; v_cut text;
begin
  for r in select * from jsonb_to_recordset(p_items) as x(id bigint, src text, checked_url text, model text, model_version text,
             item_count integer, is_single boolean, defects text[], confidence real, verdict text, reason text, usage jsonb, cost numeric, presentation text)
  loop
    v_verdict := r.verdict; v_reason := r.reason;
    select cutout_status into v_cut from products where id = r.id and feed_image_url = r.src;
    if not found then continue; end if;
    if v_verdict = 'pass' and v_cut = 'failed' then v_verdict := 'fail'; v_reason := 'cutout_failed'; end if;
    insert into product_image_checks (product_id, image_url, checked_url, model, model_version, item_count, is_single_product, defects,
                                      confidence, verdict, reason, usage, cost_usd)
    values (r.id, r.src, r.checked_url, r.model, r.model_version, r.item_count, r.is_single, coalesce(r.defects, '{}'), r.confidence,
            v_verdict, v_reason, r.usage, r.cost)
    on conflict (product_id, image_url, model) do update
      set checked_url = excluded.checked_url, model_version = excluded.model_version, item_count = excluded.item_count,
          is_single_product = excluded.is_single_product, defects = excluded.defects, confidence = excluded.confidence,
          verdict = excluded.verdict, reason = excluded.reason, usage = excluded.usage, cost_usd = excluded.cost_usd, created_at = now();
    update product_images set check_status = case when v_verdict = 'pass' then 'pass' else 'fail' end, check_reason = v_reason
     where product_id = r.id and url = r.src;

    if v_verdict = 'pass' then
      update products set image_check_status = 'ok', image_check_src = r.src, is_single_product = true, item_count = r.item_count,
             image_defects = coalesce(r.defects, '{}'), image_work_reason = null, image_check_at = now(),
             presentation = coalesce(r.presentation, presentation), presentation_src = case when r.presentation is not null then r.src else presentation_src end,
             image_status = case when image_status = 'needs_image_work' and image_reason is null then 'feed_ready' else image_status end
       where id = r.id;
      n_pass := n_pass + 1;
    else
      select i.url into cand from product_images i
       where i.product_id = r.id and i.url <> r.src and i.analyzed_at is not null and coalesce(i.check_status, '') <> 'fail'
         and coalesce(i.view_hint, 'unknown') not in ('model', 'detail', 'back') and coalesce(i.score, 0) >= 0.3
       order by i.score desc nulls last, i.id limit 1;
      if cand is not null then
        update products set feed_image_url = cand, image_check_status = null, is_single_product = null, image_check_src = null, image_work_reason = null
         where id = r.id;
        n_switch := n_switch + 1;
      else
        update products set image_check_status = 'failed', image_check_src = r.src, is_single_product = r.is_single, item_count = r.item_count,
               image_defects = coalesce(r.defects, '{}'), image_status = 'needs_image_work', image_work_reason = v_reason, image_check_at = now()
         where id = r.id;
        n_excl := n_excl + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('pass', n_pass, 'switched', n_switch, 'excluded', n_excl);
end $$;

-- Feed card: presentation + measurements (only when they belong to the current cutout / image).
create or replace function public.product_card(p_id bigint, p_stock boolean) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('id', p.id, 'brand', p.brand, 'name', p.name, 'slot', p.feed_slot, 'image', p.feed_image_url,
           'bg', p.feed_bg_color, 'whiten', p.feed_whiten, 'bbox', case when p.feed_bbox_url = p.feed_image_url then to_jsonb(p.feed_bbox) end,
           'aspect', case when p.feed_bbox_url = p.feed_image_url then p.feed_aspect end,
           'cutout', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_url end,
           'cutout_aspect', case when p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url then p.cutout_aspect end,
           'presentation', case when p.presentation_src = p.feed_image_url then p.presentation end,
           'hem', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.hem_ratio end,
           'waist', case when p.measure_status = 'ok' and p.measure_src = p.cutout_url then p.waist_ratio end,
           'fill', case when p.measure_src = p.cutout_url then p.shape_fill end,
           'price_cents', o.price_cents, 'compare_at_cents', o.compare_at_cents,
           'currency', o.currency, 'url', o.url, 'store', s.slug, 'in_stock', o.availability = 'in_stock')
    from products p
    join lateral (select * from offers o2 where o2.product_id = p.id and (not p_stock or o2.availability = 'in_stock')
                   order by (o2.availability = 'in_stock') desc, o2.price_cents nulls last limit 1) o on true
    join sources s on s.id = o.source_id
   where p.id = p_id and p.status = 'active' and (not p_stock or p.feed_ready);
$$;

revoke all on function public.presentation_todo(bigint, integer), public.presentation_apply(jsonb), public.presentation_cost(),
  public.measure_todo(bigint, integer), public.measure_apply(jsonb) from public, anon, authenticated;
grant execute on function public.presentation_todo(bigint, integer), public.presentation_apply(jsonb), public.presentation_cost(),
  public.measure_todo(bigint, integer), public.measure_apply(jsonb) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('presentation_todo'), ('presentation_apply'), ('presentation_cost'), ('measure_todo'), ('measure_apply') on conflict do nothing;
