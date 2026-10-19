-- Queue every active product that has a pre-selected image but no classification for this taxonomy yet.
-- Idempotent: products already done (any model) are not touched.
create or replace function public.enqueue_unclassified(p_tax text) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with i as (
    insert into classification_queue (product_id, taxonomy_version)
    select p.id, p_tax
      from products p
     where p.status = 'active'
       and exists (select 1 from product_images im where im.product_id = p.id and im.selected)
       and not exists (select 1 from product_classifications c where c.product_id = p.id and c.taxonomy_version = p_tax)
    on conflict (product_id) do update
      set taxonomy_version = excluded.taxonomy_version, status = 'pending', attempts = 0, last_error = null, updated_at = now()
      where classification_queue.taxonomy_version <> excluded.taxonomy_version
         or (classification_queue.status in ('failed') and classification_queue.attempts >= 3)
    returning 1)
  select count(*) into v_n from i;
  return v_n;
end $$;
revoke all on function public.enqueue_unclassified(text) from public, anon, authenticated;
grant execute on function public.enqueue_unclassified(text) to service_role;
