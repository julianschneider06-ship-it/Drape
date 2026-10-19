-- Access tokens for the `pipeline` edge function. Only the SHA-256 hash is stored.
create table public.pipeline_tokens (
  token_hash text primary key,
  label      text not null,
  created_at timestamptz not null default now()
);
alter table public.pipeline_tokens enable row level security;
revoke all on public.pipeline_tokens from anon, authenticated;
