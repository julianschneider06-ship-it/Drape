-- AI classification results and image embeddings. One row per (product, taxonomy version, model):
-- unchanged products are never classified twice with the same taxonomy + model.
create table public.product_classifications (
  id               bigint generated always as identity primary key,
  product_id       bigint not null references public.products(id) on delete cascade,
  taxonomy_version text not null,
  model            text not null,
  model_version    text,
  attributes       jsonb not null,
  confidence       real,
  valid            boolean not null,        -- passed strict JSON schema validation
  usage            jsonb,                   -- token counts, response modelVersion
  cost_usd         numeric(12,8),
  latency_ms       integer,
  source_image_url text,
  created_at       timestamptz not null default now(),
  unique (product_id, taxonomy_version, model)
);

create table public.product_embeddings (
  id               bigint generated always as identity primary key,
  product_id       bigint not null references public.products(id) on delete cascade,
  kind             text not null default 'image',
  model            text not null,
  model_version    text,
  dims             integer not null,
  embedding        extensions.vector(1536) not null,  -- L2-normalized, truncated from 3072
  source_image_url text,
  usage            jsonb,
  cost_usd         numeric(12,8),
  created_at       timestamptz not null default now(),
  unique (product_id, kind, model, dims)
);
-- The vector index (HNSW, cosine) is added when there are enough rows to need it.

alter table public.product_classifications enable row level security;
alter table public.product_embeddings enable row level security;
revoke all on public.product_classifications, public.product_embeddings from anon, authenticated;
