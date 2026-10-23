-- Insert-only add of pool rows (reserved outfits of thin styles): rows that already exist (any run, any state) are never touched.
-- New rows join the latest run, so the next normal rebuild treats them like any other row (it re-produces them in its own run).
create function public.outfit_pool_add(p_items jsonb) returns integer
language plpgsql set search_path = public as $$
declare v_n integer;
begin
  with u as (
    insert into outfit_pool (gender, kind, top_id, bottom_id, shoes_id, score, style_key, feed_order, run_id, active)
    select x.gender, x.kind, x.top_id, coalesce(x.bottom_id, 0), x.shoes_id, x.score, x.style_key, x.feed_order, (select max(run_id) from outfit_pool), true
      from jsonb_to_recordset(p_items) as x(gender text, kind text, top_id bigint, bottom_id bigint, shoes_id bigint, score real, style_key text, feed_order integer)
    on conflict (gender, top_id, bottom_id, shoes_id) do nothing
    returning 1)
  select count(*) into v_n from u;
  return v_n;
end $$;
revoke all on function public.outfit_pool_add(jsonb) from public, anon, authenticated;
grant execute on function public.outfit_pool_add(jsonb) to service_role;
insert into public.pipeline_rpc_allowlist (fn) values ('outfit_pool_add') on conflict do nothing;
