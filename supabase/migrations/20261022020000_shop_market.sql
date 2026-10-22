-- Per-shop price market. Shopify stores price by visitor country; offers were ingested from the US, the refresh runs in Dublin and asks for a market with
-- ?country=XX. shop_market says which country reproduces the ingested prices per shop (default US when a shop has no row) or that a shop is frozen.
create table public.shop_market (
  shop text primary key,
  country text,                                  -- ISO country for the market parameter; null = send no parameter
  currency text,                                 -- optional: currency the prices really are in (only set when the evidence is clear)
  frozen boolean not null default false,         -- true = the refresh does not touch this shop (no country reproduces the ingested prices)
  reason text,
  evidence jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.shop_market enable row level security;
revoke all on public.shop_market from anon, authenticated;

-- results of the market probe job: one row per shop, country tried
create table public.shop_market_probe (
  id bigint generated always as identity primary key,
  job_id bigint references public.job_requests (id),
  shop text not null,
  country text not null,                         -- 'NONE' = no parameter
  sample_n integer not null,                     -- products matched with the stored ingestion data
  within1 integer not null,                      -- of those: price within 1% of the ingested price
  within2 integer not null,
  ratio_median numeric,                          -- median of (price now / ingested price)
  http_code integer,
  note text,
  probed_at timestamptz not null default now()
);
create index shop_market_probe_shop_idx on public.shop_market_probe (shop, probed_at desc);
alter table public.shop_market_probe enable row level security;
revoke all on public.shop_market_probe from anon, authenticated;

alter table public.shop_refresh_log add column if not exists market text;
alter table public.job_requests drop constraint job_requests_job_check;
alter table public.job_requests add constraint job_requests_job_check check (job in ('refresh_stock', 'probe_market'));   -- allowlist; never add a job that makes paid AI calls

create or replace function public.shop_market_list() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('shop', shop, 'country', country, 'currency', currency, 'frozen', frozen, 'reason', reason)), '[]'::jsonb) from public.shop_market;
$$;

-- ingestion-time price per product of one shop (cheapest available variant, else cheapest: the adapter's rule) and the stored currency label
create or replace function public.probe_baseline(p_slug text, p_limit integer default 400) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'label', (select o.currency from offers o join sources s2 on s2.id = o.source_id where s2.slug = p_slug and o.currency is not null group by o.currency order by count(*) desc limit 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', x.external_id, 'p', x.p)) from (
      select r.external_id, b.p
        from raw_items r join sources s on s.id = r.source_id
        cross join lateral (select round((v->>'price')::numeric * 100)::int p from jsonb_array_elements(r.payload->'variants') v
                             order by ((v->>'available')::boolean) desc, (v->>'price')::numeric asc limit 1) b
       where s.slug = p_slug and b.p > 0 order by r.id limit least(p_limit, 1000)) x), '[]'::jsonb));
$$;

create or replace function public.probe_store(p_rows jsonb) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into shop_market_probe (job_id, shop, country, sample_n, within1, within2, ratio_median, http_code, note)
  select x.job_id, x.shop, x.country, x.sample_n, x.within1, x.within2, x.ratio_median, x.http_code, left(x.note, 200)
    from jsonb_to_recordset(p_rows) as x(job_id bigint, shop text, country text, sample_n integer, within1 integer, within2 integer, ratio_median numeric, http_code integer, note text);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.shop_log_add(p_rows jsonb) returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into shop_refresh_log (shop, job_id, attempt, status, http_code, products_seen, skipped_reason, market)
  select x.shop, x.job_id, coalesce(x.attempt, 1), x.status, x.http_code, x.products_seen, left(x.skipped_reason, 200), x.market
    from jsonb_to_recordset(p_rows) as x(shop text, job_id bigint, attempt smallint, status text, http_code integer, products_seen integer, skipped_reason text, market text);
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.runner_mint_token(p_secret text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare s text; t text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name = 'runner_secret';
  if s is null or p_secret is null or p_secret <> s then raise exception 'forbidden'; end if;
  t := encode(gen_random_bytes(24), 'hex');
  insert into pipeline_tokens (token_hash, label, allowed_fns, expires_at)
  values (encode(digest(t, 'sha256'), 'hex'), 'runner-' || to_char(now(), 'YYYYMMDD"T"HH24MISS'),
          array['source_upsert', 'offers_refresh', 'shop_log_add', 'job_claim', 'job_progress', 'job_finish', 'outfit_inputs', 'composer_inputs', 'acc_inputs', 'snapshot_put',
                'shop_market_list', 'probe_baseline', 'probe_store'],
          now() + interval '1 hour');
  return t;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['shop_market_list()', 'probe_baseline(text,integer)', 'probe_store(jsonb)', 'shop_log_add(jsonb)', 'runner_mint_token(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
insert into public.pipeline_rpc_allowlist (fn) values ('shop_market_list'), ('probe_baseline'), ('probe_store') on conflict do nothing;
