-- Image check: is the feed image ONE product without serious defects? Plus next-best-image fallback and pool eligibility.

alter table public.product_images
  add column check_status text check (check_status in ('pass', 'fail')),  -- this image was checked (or its cutout failed): never use a failed image again
  add column check_reason text;

alter table public.products
  add column image_check_status text check (image_check_status in ('ok', 'failed')),
  add column image_check_src text,          -- the feed_image_url that was checked
  add column is_single_product boolean,
  add column item_count smallint,
  add column image_defects text[],
  add column image_work_reason text,        -- why the product is image_status = needs_image_work after the check (multi_item, defect:..., cutout_failed)
  add column image_check_at timestamptz;

create table public.product_image_checks (
  id bigint generated always as identity primary key,
  product_id bigint not null references public.products (id),
  image_url text not null,                  -- feed image (source) that was checked
  checked_url text not null,                -- what the model saw: the cutout if there is one, else the original
  model text not null, model_version text,
  item_count smallint, is_single_product boolean, defects text[] not null default '{}', confidence real,
  verdict text not null check (verdict in ('pass', 'fail')), reason text,
  usage jsonb, cost_usd numeric(10, 6), created_at timestamptz not null default now(),
  unique (product_id, image_url, model)
);
alter table public.product_image_checks enable row level security;
revoke all on public.product_image_checks from anon, authenticated;

-- Work list: feed-ready products whose current feed image has been through the cutout job (ok or failed) and has no check yet for this model.
create function public.image_check_todo(p_slot text, p_after bigint, p_limit integer, p_model text)
returns table (id bigint, slot text, url text, checked_url text) language sql stable set search_path = public as $$
  select p.id, p.feed_slot, p.feed_image_url,
         case when p.cutout_status = 'ok' then p.cutout_url else p.feed_image_url end
    from products p
   where p.feed_ready and p.status = 'active' and p.feed_slot = p_slot and p.id > p_after
     and p.feed_image_url is not null and p.cutout_src = p.feed_image_url
     and not exists (select 1 from product_image_checks c where c.product_id = p.id and c.image_url = p.feed_image_url and c.model = p_model)
   order by p.id limit least(p_limit, 500);
$$;

-- Store a batch of verdicts. On a failed image: switch the product to its next best candidate image (never one that already failed);
-- the cutout job and then this check pick the new image up. No candidate left: needs_image_work + reason (out of the pool).
-- item: {id, src, checked_url, model, model_version, item_count, is_single, defects[], confidence, verdict, reason, usage, cost}
create function public.image_check_apply(p_items jsonb) returns jsonb language plpgsql set search_path = public as $$
declare
  r record; cand text; n_pass integer := 0; n_switch integer := 0; n_excl integer := 0; v_verdict text; v_reason text; v_cut text;
begin
  for r in select * from jsonb_to_recordset(p_items) as x(id bigint, src text, checked_url text, model text, model_version text,
             item_count integer, is_single boolean, defects text[], confidence real, verdict text, reason text, usage jsonb, cost numeric)
  loop
    v_verdict := r.verdict; v_reason := r.reason;
    select cutout_status into v_cut from products where id = r.id and feed_image_url = r.src;
    if not found then continue; end if;                                     -- the feed image changed meanwhile
    if v_verdict = 'pass' and v_cut = 'failed' then v_verdict := 'fail'; v_reason := 'cutout_failed'; end if;  -- no usable cutout: try another image
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

create function public.image_check_cost() returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(cost_usd), 0) from product_image_checks;
$$;

create function public.image_check_stats() returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb) from (
    select feed_slot slot, coalesce(image_check_status, 'todo') status, coalesce(image_work_reason, '') reason, count(*) n
      from products where feed_ready and status = 'active' and feed_slot in ('top', 'bottom', 'shoes', 'full_body') group by 1, 2, 3 order by 1, 2, 3) r;
$$;

-- Cutout failures also mark the image as failed, so it is never chosen as a fallback again.
create or replace function public.cutout_apply(p_items jsonb) returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update products p set cutout_status = i.status, cutout_url = i.url, cutout_reason = i.reason, cutout_model = i.model,
         cutout_version = i.version, cutout_quality = i.quality, cutout_aspect = i.aspect, cutout_src = i.src, cutout_at = now()
    from jsonb_to_recordset(p_items) as i(id bigint, status text, url text, reason text, model text, version integer, quality real, aspect real, src text)
   where p.id = i.id;
  get diagnostics n = row_count;
  update product_images im set check_status = 'fail', check_reason = 'cutout:' || coalesce(i.reason, 'failed')
    from jsonb_to_recordset(p_items) as i(id bigint, status text, reason text, src text)
   where i.status = 'failed' and im.product_id = i.id and im.url = i.src;
  return n;
end $$;

-- The outfit pool only uses products whose CURRENT feed image has an ok cutout and passed the image check as one product.
create or replace function public.outfit_inputs(p_after bigint, p_limit integer) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint), '[]'::jsonb) from (
    select jsonb_build_object('id', p.id, 'name', p.name, 'store', s.slug, 'slot', p.feed_slot, 'gender', c.attributes->>'gender',
             'category', c.attributes->>'category', 'sub', c.attributes->>'subcategory', 'styles', c.attributes->'style_weights',
             'colors', c.attributes->'colors', 'pattern', c.attributes->>'pattern', 'material', c.attributes->>'material',
             'silhouette', c.attributes->>'silhouette', 'fit', c.attributes->>'fit', 'formality', (c.attributes->>'formality')::float,
             'boldness', (c.attributes->>'boldness')::float, 'statement', (c.attributes->>'statement_level')::float,
             'outer', (c.attributes->>'is_outer_layer')::boolean, 'season', c.attributes->'season') x
      from products p
      join lateral (select * from product_classifications c2 where c2.product_id = p.id and c2.taxonomy_version = 'v2'
                     order by (c2.model = 'gemini-3.1-flash-lite') desc, c2.created_at desc limit 1) c on true
      join lateral (select source_id from offers o where o.product_id = p.id and o.availability = 'in_stock' limit 1) o on true
      join sources s on s.id = o.source_id
     where p.status = 'active' and p.feed_ready and p.feed_slot in ('top','bottom','shoes','full_body') and p.id > p_after
       and p.cutout_status = 'ok' and p.cutout_src = p.feed_image_url
       and p.image_check_status = 'ok' and p.image_check_src = p.feed_image_url and p.is_single_product
     order by p.id limit least(p_limit, 1000)) t;
$$;

revoke all on function public.image_check_todo(text, bigint, integer, text), public.image_check_apply(jsonb), public.image_check_cost(), public.image_check_stats() from public, anon, authenticated;
grant execute on function public.image_check_todo(text, bigint, integer, text), public.image_check_apply(jsonb), public.image_check_cost(), public.image_check_stats() to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('image_check_todo'), ('image_check_apply'), ('image_check_cost'), ('image_check_stats') on conflict do nothing;
