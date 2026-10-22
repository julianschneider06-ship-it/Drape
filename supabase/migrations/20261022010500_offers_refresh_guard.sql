-- offers_refresh guard: some shops show different prices per visitor country (Shopify Markets). A refresh from another country than the one the offers were
-- ingested from would overwrite prices with another market's prices (seen on 2026-10-22: the runner in Dublin vs the US ingestion). If more than 30% of the matched
-- offers of a shop would change price, nothing is applied and {suspicious: true} is returned (the caller logs the shop as skipped). p_guard = false forces it.
drop function if exists public.offers_refresh(integer, jsonb, boolean);
create or replace function public.offers_refresh(p_source_id integer, p_items jsonb, p_complete boolean default false, p_guard boolean default true) returns jsonb
language plpgsql set search_path to 'public' as $function$
declare res jsonb; n_t integer; n_pr integer;
begin
  if p_guard then
    select count(*), count(*) filter (where o.price_cents is distinct from coalesce(i.price_cents, o.price_cents)) into n_t, n_pr
      from offers o join jsonb_to_recordset(p_items) as i(external_id text, availability text, price_cents integer, compare_at_cents integer) on i.external_id = o.external_id
     where o.source_id = p_source_id;
    if n_t >= 20 and n_pr > 0.3 * n_t then return jsonb_build_object('suspicious', true, 'checked', n_t, 'price_changed', n_pr); end if;
  end if;
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
    'feed_ready_changed', (select count(*) from ch join products p on p.id = ch.product_id where p.feed_ready)
      + (select count(*) from gone g join products p on p.id = g.product_id where p.feed_ready)) into res;
  return res;
end $function$;
revoke all on function public.offers_refresh(integer, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.offers_refresh(integer, jsonb, boolean, boolean) to service_role;
