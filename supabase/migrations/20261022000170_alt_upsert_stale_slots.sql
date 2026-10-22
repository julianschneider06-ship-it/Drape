-- outfit_alternatives kept rows for accessory slots that an outfit no longer has (a later accessory run gave the outfit fewer accessories):
-- alt_upsert only deactivated ranks beyond the new list inside the SAME slot. Now every slot key of the outfit that is not in the new item is deactivated too.
-- (One-time cleanup, UPDATE only: 11,106 such rows, among them 149 rows of 17 sold-out accessories.)
create or replace function public.alt_upsert(p_items jsonb) returns integer language plpgsql set search_path to 'public' as $f$
declare n integer := 0; it jsonb; sl jsonb;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    for sl in select * from jsonb_array_elements(it->'slots') loop
      insert into outfit_alternatives (outfit_id, slot_key, rank, product_id, score, scorer_version, active)
      select (it->>'outfit_id')::bigint, sl->>'slot_key', (a.ord)::smallint, (a.elem->>'product_id')::bigint, (a.elem->>'score')::real, it->>'version', true
        from jsonb_array_elements(sl->'alts') with ordinality as a(elem, ord)
      on conflict (outfit_id, slot_key, rank) do update set product_id = excluded.product_id, score = excluded.score, scorer_version = excluded.scorer_version, active = true, built_at = now();
      update outfit_alternatives set active = false
       where outfit_id = (it->>'outfit_id')::bigint and slot_key = sl->>'slot_key' and rank > jsonb_array_length(sl->'alts') and active;
      n := n + 1;
    end loop;
    update outfit_alternatives set active = false
     where outfit_id = (it->>'outfit_id')::bigint and active
       and slot_key not in (select s->>'slot_key' from jsonb_array_elements(it->'slots') s);
    insert into outfit_alt_state (outfit_id, input_hash) values ((it->>'outfit_id')::bigint, it->>'input_hash')
      on conflict (outfit_id) do update set input_hash = excluded.input_hash, built_at = now();
  end loop;
  return n;
end $f$;
