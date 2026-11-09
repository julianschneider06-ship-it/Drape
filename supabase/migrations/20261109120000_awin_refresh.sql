-- Feed-based stock + price refresh of Awin shops (kind awin only). One entry point for scripts/refresh-awin-stock.ts, INSERT/UPDATE only, no deletes.
-- mode 'ids'   : our offer external ids of the shop (the script sends only matching feed rows)
-- mode 'plan'  : read-only counts of what an apply would do
-- mode 'apply' : the existing offers_refresh (p_complete = true: offers missing from p_items go out_of_stock, offers back in the feed return to in_stock)
-- Price guard (per product, magnitude): a new price more than 30% away from the stored one is rejected (old price and compare-at kept, stock still applied)
-- and counted in price_rejected; if more than 30% of a shop's matched offers (>= 20) would be rejected, nothing is applied for the shop (guard_rejected).
-- p_items rows: {external_id, availability, price_cents, compare_at_cents, image}
create or replace function public.awin_refresh(p_slug text, p_mode text, p_items jsonb default '[]'::jsonb) returns jsonb
language plpgsql set search_path to 'public' as $function$
declare sid integer; res jsonb; plan jsonb; n_t integer; n_rej integer; n_all integer; sus boolean; adj jsonb;
begin
  select id into sid from sources where slug = p_slug and kind = 'awin' and active;
  if sid is null then raise exception 'not an active awin source: %', p_slug; end if;
  if p_mode = 'ids' then
    return (select coalesce(jsonb_agg(external_id), '[]'::jsonb) from offers where source_id = sid);
  end if;
  select count(*) into n_all from offers where source_id = sid;
  with i as (select * from jsonb_to_recordset(p_items) as x(external_id text, availability text, price_cents integer, compare_at_cents integer, image text)),
  a as (select i.external_id, i.availability, i.image, o.product_id, o.availability old_av, o.price_cents old_pr, o.compare_at_cents old_cmp,
               (o.price_cents > 0 and i.price_cents is not null and abs(i.price_cents - o.price_cents) > 0.3 * o.price_cents) rej,
               i.price_cents new_pr0, i.compare_at_cents new_cmp0
          from i left join offers o on o.external_id = i.external_id and o.source_id = sid),
  b as (select *, case when rej then old_pr else coalesce(new_pr0, old_pr) end new_pr, case when rej then old_cmp else new_cmp0 end new_cmp from a where product_id is not null)
  select jsonb_build_object(
    'offers', n_all,
    'matched', count(*),
    'unmatched', n_all - count(*),
    'unmatched_in_stock', (select count(*) from offers o where o.source_id = sid and o.availability = 'in_stock' and o.external_id not in (select external_id from i)),
    'price_changed', count(*) filter (where not rej and old_pr is distinct from new_pr),
    'price_rejected', count(*) filter (where rej),
    'sold_out', count(*) filter (where old_av = 'in_stock' and availability <> 'in_stock'),
    'restored', count(*) filter (where old_av <> 'in_stock' and availability = 'in_stock'),
    'compare_changed', count(*) filter (where old_cmp is distinct from new_cmp),
    'image_changed', count(*) filter (where image is not null and not exists (select 1 from product_images pi where pi.product_id = b.product_id and pi.url = b.image)),
    'changed', count(*) filter (where old_pr is distinct from new_pr or old_av is distinct from availability or old_cmp is distinct from new_cmp)
       + (select count(*) from offers o where o.source_id = sid and o.availability = 'in_stock' and o.external_id not in (select external_id from i))
  ), count(*), count(*) filter (where rej),
  (select coalesce(jsonb_agg(jsonb_build_object('external_id', b.external_id, 'availability', b.availability, 'price_cents', b.new_pr, 'compare_at_cents', b.new_cmp)), '[]'::jsonb) from b)
  into plan, n_t, n_rej, adj from b;
  sus := n_t >= 20 and n_rej > 0.3 * n_t;
  plan := plan || jsonb_build_object('guard_rejected', sus);
  if p_mode <> 'apply' then return plan; end if;
  if sus then return plan || jsonb_build_object('applied', false); end if;
  res := offers_refresh(sid, adj, true, false);
  return plan || jsonb_build_object('applied', true, 'result', res);
end $function$;
revoke all on function public.awin_refresh(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.awin_refresh(text, text, jsonb) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('awin_refresh') on conflict do nothing;
