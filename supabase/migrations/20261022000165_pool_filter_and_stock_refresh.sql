-- 1. The pool builder reads outfit_inputs. It now applies the same availability filter as the composer catalogue (composer_inputs): in-stock offer (already there)
--    AND measurements for tops / bottoms. (The feed read path product_card(.., true) also filters sold-out pieces at read time.)
create or replace function public.outfit_inputs(p_after bigint, p_limit integer) returns jsonb language sql stable set search_path to 'public' as $f$
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
       and (p.feed_slot in ('shoes','full_body')
            or (p.measure_status = 'ok' and p.measure_src = p.cutout_url and ((p.feed_slot = 'top' and p.hem_ratio is not null) or (p.feed_slot = 'bottom' and p.waist_ratio is not null))))
     order by p.id limit least(p_limit, 1000)) t;
$f$;

-- 2. Stock / price refresh of the offers of one shop (called by scripts/refresh-stock.ts). Idempotent: only rows that differ are updated; every matched row gets last_seen_at = now().
--    p_complete = the feed was read to its end: offers of this shop that are not in the feed any more count as sold out ("delisted").
create or replace function public.offers_refresh(p_source_id integer, p_items jsonb, p_complete boolean default false) returns jsonb language plpgsql set search_path to 'public' as $f$
declare res jsonb;
begin
  with i as (select * from jsonb_to_recordset(p_items) as x(external_id text, availability text, price_cents integer, compare_at_cents integer)),
  t as (select o.id, o.product_id, o.availability old_av, o.price_cents old_pr, o.compare_at_cents old_cmp, i.availability new_av, coalesce(i.price_cents, o.price_cents) new_pr, i.compare_at_cents new_cmp
          from offers o join i on i.external_id = o.external_id where o.source_id = p_source_id),
  ch as (select * from t where old_av is distinct from new_av or old_pr is distinct from new_pr or old_cmp is distinct from new_cmp),
  upd as (update offers o set availability = ch.new_av, price_cents = ch.new_pr, compare_at_cents = ch.new_cmp, last_seen_at = now(), updated_at = now() from ch where o.id = ch.id returning o.id),
  seen as (update offers o set last_seen_at = now() from t where o.id = t.id and not exists (select 1 from ch where ch.id = o.id) returning o.id),
  gone as (update offers o set availability = 'out_of_stock', last_seen_at = now(), updated_at = now()
            where p_complete and o.source_id = p_source_id and o.availability = 'in_stock' and o.external_id not in (select external_id from i) returning o.product_id)
  select jsonb_build_object(
    'checked', (select count(*) from t),
    'became_sold_out', (select count(*) from ch where old_av = 'in_stock' and new_av <> 'in_stock'),
    'back_in_stock', (select count(*) from ch where old_av <> 'in_stock' and new_av = 'in_stock'),
    'price_changed', (select count(*) from ch where old_pr is distinct from new_pr),
    'sale_started', (select count(*) from ch where coalesce(old_cmp, 0) <= coalesce(old_pr, 0) and coalesce(new_cmp, 0) > coalesce(new_pr, 0)),
    'sale_ended', (select count(*) from ch where coalesce(old_cmp, 0) > coalesce(old_pr, 0) and coalesce(new_cmp, 0) <= coalesce(new_pr, 0)),
    'delisted', (select count(*) from gone),
    'feed_ready_changed', (select count(*) from ch join products p on p.id = ch.product_id where p.feed_ready and (ch.old_av is distinct from ch.new_av or ch.old_pr is distinct from ch.new_pr or ch.old_cmp is distinct from ch.new_cmp))
      + (select count(*) from gone g join products p on p.id = g.product_id where p.feed_ready)) into res;
  return res;
end $f$;
revoke all on function public.offers_refresh(integer, jsonb, boolean) from public, anon, authenticated;
