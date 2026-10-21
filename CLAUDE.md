# Drape – Working rules for Claude

Drape is a personalized fashion discovery website: a vertically scrolling feed of complete outfits (TikTok principle) in which individual products can be tapped, liked and collected. Mobile first, minimalist, white background. Not a classic online shop.

The user has no coding experience and steers the whole project through Claude (chat and Claude Code). Reply to the user in English, in simple words, short.

## Principles (in order of priority)

1. **Fast progress first.** Think straight ahead, don't brood over edge cases, don't secure every spot. Ship something that runs, then improve it. The one limit: never take a shortcut that blocks scalability (see "Scalability" below).
2. **Security and legal/rights topics are postponed.** They come at the end of the project. Until then keep them to the minimum: no hardening, no attack scenarios, no legal review (scraping rights, privacy, licenses), no questions about them. Exceptions that cost no effort and always apply:
   - Secret keys (Supabase `service_role`/secret key, API keys of paid services) **never** go into the Git repo and **never** into browser code. They live only as environment variables in Vercel or Supabase.
   - Anything that costs money (paid AI calls, Supabase upgrades, domains) must not be triggerable by the public.
   - Postponed security topics are noted in `docs/security-backlog.md` so they are not forgotten at the end.
3. **Claude does everything itself.** The user should never have to work in Vercel, GitHub or Supabase directly. If a permission, connection or setting is missing, ask for it right away and change it directly instead of pushing the work to the user. Only if it is technically impossible (e.g. creating an account, approving a payment), give the user the shortest path.
4. **Don't just patch problems.** On every error, research the cause first (logs, documentation, web search), then explain what is going on, then fix it and, as far as possible, improve the root cause so the problem does not come back. Always suggest the next sensible step on your own initiative instead of waiting.
5. **Don't work around blocks.** If something is denied by a system policy (403 from the proxy, blocked domain), do not use tricks. Report it and suggest a legitimate way.

## Scalability (core requirement, applies even in fast mode)

Scalability is very important to the user. Design for millions of products and users from day one. Cheap choices that would block scaling later are not allowed, even when moving fast.

- **Source adapters.** Product data enters through a source-adapter layer (crawler, affiliate feed, ...). Every adapter normalizes into the same product schema, so sources are swappable and new shops can be added without touching the rest. The same product from several shops merges into one canonical product with several offers.
- **Background work, never in the request path.** Ingestion and AI classification run as batched, idempotent background jobs (queue, cron, edge functions). Classify each product once and store attributes plus an embedding (pgvector). Never re-classify unchanged products.
- **Fast feed.** Feed requests use precomputed or cached candidate pools, indexed queries and cursor pagination. No full-table scans, no heavy computation per request.
- **User signals.** Store interactions in an append-only event log and keep a compact per-user taste vector that is updated incrementally. Plan for partitioning or archiving of events.
- **Cost control.** Batch AI calls, cache results, and keep paid calls out of public reach.
- Record architecture decisions that matter for scale in `docs/architecture.md`.

## Project setup (done so far)

- **GitHub:** `julianschneider06-ship-it/drape`, branch `main`.
- **Vercel:** project `drape` (id `prj_JSMzTYnpPOwINsbWnRes24mGv2kk`), personal account (no team), framework preset `nextjs`. Live at `https://drape-julian-schneider.vercel.app`. Public access, Vercel Authentication is off. Push to `main` deploys automatically.
- **Supabase:** project `Drape` (ref `ntknoxzhljktxhsbudlr`, region `eu-west-1`), API URL `https://ntknoxzhljktxhsbudlr.supabase.co`. No tables yet.
- **Environment variables already set in Vercel** (production, preview, development): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A secret key is not set yet; if needed, add it in Vercel only.
- **Vercel tool note:** when using the Vercel MCP tools, do not pass `teamId`. The account is personal, and passing the team id returns 403. Build logs are readable with `list_deployment_events`.
- **Sandbox note:** the cloud environment's network access must be **Trusted** or **Full** so `npm install` can reach the registry. If `registry.npmjs.org` returns 403, tell the user to switch the environment's network access setting (do not work around it).

## Tech

- **Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres, Auth), Vercel (hosting), GitHub (code). Later as a PWA for the iPhone home screen.
- **Data model principle:** Products are the objects users like and save. Outfits are assembled from products and are **not** stored as their own saved unit.
- **No dislike on products.** Products can only be liked and saved. The one negative signal is the outfit-level "do not like this outfit" button (three chevrons pointing down); it exists as a signal only. Personalization learns from onboarding (style directions), likes and implicit signals (scrolling past, dwell time, tapping a product).
- **Outfit buttons.** Every outfit screen has two small buttons: triple chevrons up = I like this outfit, triple chevrons down = I do not like this outfit. They write `outfit_up` / `outfit_down` / `outfit_clear` events to the append-only event log and will be used in personalization (step 4); they do not change the feed yet.
- **Product classification:** Style is a combination of attributes, never a single category.
- **AI provider:** Google Gemini (Google AI Studio) for image classification and multimodal embeddings, behind a model adapter so providers can be swapped (Claude, Voyage, ...). Store the model name and version with every classification and embedding. The API key lives only as a secret (Supabase Edge Function secret or Vercel environment variable), never in the repo or browser.
- **Mobile first.** Build every screen for a smartphone display first, then for larger screens.

## Rough roadmap (context only)

The user tells you step by step what to work on right now. Do not start later steps on your own; you may suggest the next one. Rough order:

1. Setup (done)
2. Data pipeline with a real product sample (source adapter, normalized schema), then AI classification (attributes + embeddings)
3. Outfit feed with like and product view
4. Personalization (event log, taste vector, ranking)
5. Onboarding, login, "My collection"
6. More sources at scale (partner feeds), then security and legal/rights

## Working in Claude Code

- Commit messages short, in English, one commit per finished step.
- After every step check that the Vercel build is green before reporting anything as done.
- New libraries may be added without asking if they serve progress.
- Create database tables and migrations yourself (Supabase tools or SQL migrations in the repo).
- **Session tokens always expire after 24h; never delete rows, never mint tokens without expiry.** Hash only in `pipeline_tokens`, plaintext only in memory.
- End every reply with one sentence saying what comes next.
