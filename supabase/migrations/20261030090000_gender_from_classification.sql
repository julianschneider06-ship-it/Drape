-- products.gender comes from the shop feed and is empty for many streetwear / skater shops. The classification knows the gender (women / men / unisex),
-- and the outfit builders already read it from there. Keep products.gender in step: a trigger fills an EMPTY products.gender from every new or updated
-- classification (never overwrites a gender that the shop feed gave), plus a one-time backfill (UPDATE only).
create or replace function public.fill_gender_from_classification() returns trigger language plpgsql set search_path = public as $$
begin
  if new.valid and new.attributes->>'gender' in ('women', 'men', 'unisex') then
    update products set gender = new.attributes->>'gender', updated_at = now() where id = new.product_id and gender is null;
  end if;
  return new;
end $$;
drop trigger if exists trg_fill_gender on public.product_classifications;
create trigger trg_fill_gender after insert or update of attributes on public.product_classifications
  for each row execute function public.fill_gender_from_classification();

update products p set gender = c.g, updated_at = now()
  from (select distinct on (product_id) product_id, attributes->>'gender' g from product_classifications
         where valid and attributes->>'gender' in ('women', 'men', 'unisex')
         order by product_id, (model = 'gemini-3.1-flash-lite') desc, created_at desc) c
 where p.id = c.product_id and p.gender is null;
