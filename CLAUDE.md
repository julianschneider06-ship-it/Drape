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
- **Fast feed.** A feed page is either precomputed or CDN-cached (starter set, guests, pool pages) or composed on demand from a versioned in-memory catalogue snapshot kept per function instance. No database read per page except small per-device state such as a taste vector, no full-table scans, a budget under 150 ms per page, and never a paid service call. Catalogue, candidate lists and alternatives are refreshed by background jobs. Per-device state (taste, ban list) is small, incremental and expires when inactive.
- **User signals.** Store interactions in an append-only event log and keep a compact per-user taste vector that is updated incrementally. Plan for partitioning or archiving of events.
- **Cost control.** Batch AI calls, cache results, and keep paid calls out of public reach.
- **Composed outfits are not stored.** An outfit is a list of piece ids; its id is a hash of those ids and events carry the piece ids. Season, dominant style and the other outfit tags (season_primary always set + season_fit, style_primary / style_secondary / style_distinct, formality_level, weather, occasion, palette, boldness, silhouette, contrast, has_outer_layer, sale_count) are computed on demand by shared pure functions and never stored per outfit. A per-device ban list holds recently served single products only (at most 25% of each group and at most 300, client-held by default, with a soft fallback), never outfits.
- **Availability.** Only pieces with an in-stock offer, a clean cutout and measurements are shown, in both feeds. `scripts/refresh-stock.ts` (manual) and the daily job keep availability and prices current.
- **Cost guards.** Every paid script prints an estimate first, has its own cap from an environment variable, and runs under the shared run cap DRAPE_RUN_CAP_USD (default $10) enforced in code (`src/lib/budget.ts`). No AI call exists in the web app or edge functions. Session tokens always expire after 24h (the web token vercel-sample-page is the one documented exception); never delete rows; never mint tokens without expiry; token hashes only in `pipeline_tokens`, plaintext only in memory.
- **Shop crawling.** Public product feeds only; respect robots.txt and rate limits; skip hosts that answer 401/403/404/410/429/503 and never work around them.
- **Gender.** products.gender is filled from the classification when empty (trigger); unisex means usable for both genders.
- **Taste.** Taste is per device and per slot, learned incrementally from the event log, held on the client by default; the event log is the source of truth.
- Record architecture decisions that matter for scale in `docs/architecture.md`.

## Token-saving rules

- Reports to the user: max 8 lines, plain language, structure: Done / Changed / Problems / Needs decision. No long tables, no pasted logs, no code dumps unless asked.
- Never paste large tool output. Use LIMIT on every SQL query, count first, read only needed columns.
- Read only the files and line ranges you need. Do not re-read files you just wrote. Do not run extra verification beyond what the task requires.
- One task per session: when the task is finished, stop and report; do not start side tasks. Mention ideas in one line instead of doing them.
- Docs-only commits: add "[skip ci]" to the commit message to avoid needless deployments.
- Never search old logs or files for secrets.

## CLAUDE.md maintenance

- At the end of every task, update CLAUDE.md yourself, only with durable facts or rules that future sessions need (new tables, settings, shop restrictions, decisions).
- No progress logs, no one-off details, no secrets. One or two lines per entry. Merge or delete outdated entries.
- Keep CLAUDE.md under about 150 lines. If it grows beyond that, condense it.
- Mention in your report, in one line, what you changed in CLAUDE.md.

## Current state (details in `docs/architecture.md`, open security topics in `docs/security-backlog.md`)

- **Feed variants:** `?feed=base|dynamic|hybrid` and `?sale=on|off` override the defaults. Defaults live in table `app_settings` (`feed_default`, `sale_marker_enabled`), read on the server only, cached about 45 s. Sale marker: red hand-drawn outline per shape plus one SALE label per product.
- **Jobs:** table `job_requests` (allowlist: `refresh_stock` and `probe_market` only, never a paid job). Runner route is ticked by pg_cron + pg_net every 5 minutes; stock refresh is enqueued daily at 01:15 UTC. Per-shop result of every attempt in `shop_refresh_log`.
- **Markets:** each shop has its own market (country) in `shop_market`, plus a `frozen` flag with a stored reason. No row = default US (`country=US`). The runner runs in Dublin, so the market must be set explicitly per shop. A 30% price-change guard rejects suspicious updates per shop.
- **Market probe result:** 11 formerly frozen shops now have their own market (DE, GB, SE, JP). `nordgreen` stays frozen (needs re-ingest and re-probe). `margarethowell` is held by the guard.
- **Currency labels:** audit done, five shops corrected to USD. Shops with unclear evidence are listed in `docs/architecture.md`; do not guess their currency.
- **Onboarding:** first-visit 3-step tutorial (`TutorialFeed.tsx` + `Onboarding.tsx`, flag `drape.onboarding.done` in localStorage, `?onboarding=1` forces it). Two pinned outfits in `src/lib/onboarding.ts`, served by `/api/onboarding` from the catalogue snapshot. Nothing is recorded (no events, likes, taste). It is its own component tree (gestures never re-render the feed); all images are loaded AND decoded before step 1 (10 s timeout = skip, not marked done); the real feed loads only after step 3 has been idle. Step 3 is skipped if `sale_marker_enabled` is off or no sale label shows.
- **Welcome flow:** before the tutorial, `Welcome.tsx` asks gender (Men/Women) and up to 5 of all 24 styles (`STYLE_KEYS`, labels from `styleLabel` in `src/lib/welcome.ts`). Stored in localStorage (`drape.gender`, `drape.styles`), nothing recorded. Gender starts the real feed; styles seed the taste (`seedStyles`, hybrid feed only, sent as `seed` while the device has no taste). The default feed `base` ignores styles. Women see an "Example looks" line over the (menswear) tutorial.
- **Perf rules (feed/tutorial):** animate only transform/opacity (no layout animation on swaps in the tutorial); SVG-filter shapes that move or fade are pre-rendered as SVG images; never poll layout; check changes under CPU throttling (6x) with CDP metrics.
- **Women's accessory shops (branch `women-accessories`, merge pending):** lelesadoughi, stoneandstrand, eugeniakim, cluse (EUR, market DE), jenniferbehr active; ettika flagged (57% usable). Source options `familyCap` and `inStockOnly` in `scripts/ingest.ts`; check a candidate shop first with `scripts/probe-usable.ts` (the 20-sample over-predicts; use 40). Slot logic unchanged (hair = `other_wearable`). Details in `docs/architecture.md`.
- **Women's accessory slots (branch `women-accessory-slots`, merge pending):** limits in `WOMEN_ACC` (min 3 / max 6 accessories, max 1 each sunglasses/head/bag, up to 3 jewelry, belt max 1); men unchanged. New set lives next to the old one (`outfit_accessories_w2`, `feed_list_w2`, `?accrev=2`); at merge flip `ACC_REV_DEFAULT` in `src/app/api/feed/route.ts`. Details in `docs/architecture.md`.
- **Dashboard:** read-only views `dash_*` (security_invoker, no access for anon/authenticated).
- **Tests:** `npm test` runs a mocked 429 retry test (one retry after at least 6 s, no third request); no real shop is touched.
- **Cost limit:** `DRAPE_RUN_CAP_USD`; nothing public may trigger paid calls.

## Project setup (done so far)

- **GitHub:** `julianschneider06-ship-it/drape`, branch `main`.
- **Vercel:** project `drape` (id `prj_JSMzTYnpPOwINsbWnRes24mGv2kk`), personal account (no team), framework preset `nextjs`. Live at `https://drape-julian-schneider.vercel.app`. Public access, Vercel Authentication is off. Push to `main` deploys automatically.
- **Supabase:** project `Drape` (ref `ntknoxzhljktxhsbudlr`, region `eu-west-1`), API URL `https://ntknoxzhljktxhsbudlr.supabase.co`.
- **Environment variables already set in Vercel** (production, preview, development): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A secret key is not set yet; if needed, add it in Vercel only.
- **Vercel tool note:** when using the Vercel MCP tools, do not pass `teamId`. The account is personal, and passing the team id returns 403. Build logs are readable with `list_deployment_events`.
- **Sandbox note:** the cloud environment's network access must be **Trusted** or **Full** so `npm install` can reach the registry. If `registry.npmjs.org` returns 403, tell the user to switch the environment's network access setting (do not work around it).

## Tech

- **Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres, Auth), Vercel (hosting), GitHub (code). Later as a PWA for the iPhone home screen.
- **Data model principle:** Products are the objects users like and save. Outfits are assembled from products and are **not** stored as their own saved unit.
- **No dislike on products.** Products can only be liked and saved. The one negative signal is the outfit-level "do not like this outfit" button (three chevrons pointing down); it exists as a signal only. Personalization learns from onboarding (style directions), likes and implicit signals (scrolling past, dwell time, tapping a product).
- **Outfit buttons.** Every outfit screen has two small buttons: triple chevrons up = I like this outfit, triple chevrons down = I do not like this outfit. They write `outfit_up` / `outfit_down` / `outfit_clear` events to the append-only event log and will be used in personalization (step 4); they do not change the feed yet.
- **Swap = implicit signal, not a dislike.** Swiping a piece sideways swaps only that piece for a precomputed alternative and logs a `swap` event (product out / in, direction, rank). A replaced piece is a weak negative signal, a kept or liked piece a positive one (step 4); it is NOT a dislike button, the "no dislike on products" rule stays. Swaps are a loop of three per piece (original + 2 alternatives that come with the feed page; swipe right = next, left = previous, both loop). Swap events carry `alt` / `from` (0 = original, 1, 2). Swaps are in-session only and do not change the feed or ranking yet; later personalization picks the 2 alternatives per device from the stored list (`outfit_alternatives`).
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
- End every reply with one sentence saying what comes next.
