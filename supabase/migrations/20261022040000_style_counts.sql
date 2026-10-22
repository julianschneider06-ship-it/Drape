-- Welcome style picker: how many pool outfits each style has per gender (read-only, display only; the picker hides styles without outfits).
create or replace function public.style_counts(p_gender text) returns jsonb language sql stable set search_path to 'public' as $f$
  select coalesce(jsonb_object_agg(style_key, n), '{}'::jsonb)
    from (select style_key, count(*) n from outfit_pool where gender = p_gender and active and style_key is not null group by style_key) c;
$f$;
revoke all on function public.style_counts(text) from public, anon, authenticated;
grant execute on function public.style_counts(text) to service_role;
insert into pipeline_rpc_allowlist (fn) select 'style_counts' where not exists (select 1 from pipeline_rpc_allowlist where fn = 'style_counts');
update pipeline_tokens set allowed_fns = allowed_fns || array['style_counts'] where label = 'vercel-sample-page' and not ('style_counts' = any(allowed_fns));
