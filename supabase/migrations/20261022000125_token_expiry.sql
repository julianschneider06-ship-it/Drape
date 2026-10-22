-- Session tokens expire. null = no expiry (only the long-lived web token); new tokens default to 24 hours.
alter table public.pipeline_tokens add column if not exists expires_at timestamptz;
alter table public.pipeline_tokens alter column expires_at set default (now() + interval '24 hours');
update public.pipeline_tokens set expires_at = now() where label in ('batch-session-acc', 'batch-2026-10-21-accessories', 'claude-session-2026-10-19') and (expires_at is null or expires_at > now());
