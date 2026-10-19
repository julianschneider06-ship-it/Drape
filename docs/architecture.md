# Architecture (data pipeline, roadmap step 2 part 1)

## Data flow

```
shop (Shopify /products.json, later feeds)
  -> SourceAdapter.fetchPage()      src/ingest/adapters/*   (polite HTTP, backoff, cursor)
  -> adapter.normalize()            common schema: src/ingest/types.ts
  -> scripts/ingest.ts              batch job, 100 items per call, resumable
  -> edge function `pipeline`       database gateway (service key never leaves Supabase)
  -> SQL function ingest_batch()    one set-based upsert per batch
  -> tables: raw_items, products, offers, product_images
```

AI classification is not part of this step. `classification_queue` exists and is empty.

## Scale decisions

- **Sources are config.** A Shopify store is one line in `src/ingest/sources.ts`. New kinds (feeds, Zalando) implement the same `SourceAdapter` interface; nothing downstream changes. Zalando is an inactive stub: the site blocks bots (Akamai 403), so the plan is a partner/affiliate feed.
- **Raw first.** Every source item is stored untouched in `raw_items` (jsonb + content hash). Re-normalizing needs no re-crawl.
- **Idempotent by construction.** Unique keys: `raw_items(source_id, external_id)`, `offers(source_id, external_id)`, `products(canonical_key)`, `product_images(product_id, url)`. Running a batch twice changes nothing. `ingest_batch` is one set-based SQL call per 100 items, not row by row.
- **Canonical products, many offers.** `canonical_key = sha1(brand | name | colour | gender)` merges the same product from several shops into one `products` row with several `offers`. When the colour is unknown we do NOT merge (the key uses source + external id), because a wrong merge is worse than a missed one. Found the hard way: Outdoor Voices sells one colour per product and has no colour field.
- **Compact keys, targeted indexes.** `bigint identity` ids (no random-uuid index bloat). Indexes only on lookup paths: offers by product and by (source, last_seen), images by (product, position), products by (category, gender, id) and by brand, partial indexes for un-normalized raw rows and for pending queue rows. Cursor pagination (`id > after`), never offset.
- **Resumable batch.** `ingestion_runs.cursor` is saved after every page. A killed or failed run continues from its cursor on the next start; `--fresh` starts over. The quota is spread across a store's feeds (e.g. women/men collections).
- **Polite crawling.** Only `/products.json` and `/collections/<handle>/products.json` (plus `/meta.json` once, for the currency). 1.5 s minimum gap per host, retries with 2/4/8/16 s backoff, honours `Retry-After`, identifying User-Agent. Never `/api/*`.
- **Background work, not in the request path.** Ingestion is a CLI batch (`npm run ingest -- --max 190`). The web page only reads.
- **No secrets in repo or browser.** Tables have RLS on and no policies. The service key stays inside Supabase; batch scripts and the Next.js server talk to the edge function `pipeline` with a token whose SHA-256 hash lives in `pipeline_tokens`. The Vercel token is a sensitive env var (`DRAPE_PIPELINE_TOKEN`). The AI key is not used by the web app.
- **pgvector enabled** (`extensions` schema), no vector columns yet. `gemini-embedding-2` returns 3072 dims by default; HNSW indexes allow up to 2000 dims for `vector` (4000 for `halfvec`), so the classification step should use `outputDimensionality` 1536 or a `halfvec(3072)` column.
- **Models are swappable.** `src/config/models.ts`: `DRAPE_MODEL_CLASSIFIER` (default `gemini-3.5-flash-lite`) and `DRAPE_MODEL_EMBEDDING` (default `gemini-embedding-2`). The REST API accepts the `AQ.` key through the `x-goog-api-key` header.

## Known limits / next scale steps

- Prices are in each store's currency (from `/meta.json`), not converted. Stale offers are trackable via `offers.last_seen_at`, but nothing marks them as gone yet.
- Colour is missing for about 24% of products; the classification step will derive it from the images.
- `/sample` orders by id, so it is grouped by shop. The real feed will use precomputed candidate pools.
- 400 hidden orphan product rows (status `hidden`) remain from the first sample run; delete them when convenient.
- At millions of rows: partition `raw_items` by source or archive old payloads; run `ingest_batch` calls from a queue or cron (Edge Function / Vercel cron).

## Classification (taxonomy v1, tested on one product)

- Taxonomy and strict JSON schema: `src/classify/taxonomy.ts` (`TAXONOMY_VERSION = "v1"`). 10 style weights (0..1, never a single label), category, gender, colors, pattern, material, silhouette, fit, boldness, formality, outfit_role, season, confidence. Output is forced by `responseJsonSchema` and validated again with Ajv.
- Results: `product_classifications` (unique per product + taxonomy version + model, so nothing is classified twice) and `product_embeddings` (`vector(1536)`, L2-normalized, from the product image). Model name and version, token usage, cost and latency are stored with each row.
- One-product test: `npx tsx scripts/classify-one.ts <product_id>`. About $0.0011 and 3.4 s per product (classification + image embedding).

## Image pre-selection and feed readiness (step 2, part 2)

- **Slots.** The feed shows 3 stacked slots: top, bottom, shoes. `feed_slot` is `top` (tops AND outerwear), `bottom`, `shoes`, `full_body` (dresses, jumpsuits, sets) or `none` (accessories). `is_outer_layer` marks jackets/coats worn over another top.
- **Free pre-selection first, AI second.** Every image gets free scores (`product_images`: `bg_whiteness`, `object_fill`, `view_hint`, `score`, `feed_rank`, `selected`): Shopify position, filename/alt hints (front/flat/packshot good; back/detail/model/lifestyle bad), aspect ratio, and a pixel check on a 200px CDN thumbnail (border plainness x brightness, how much of the frame the product fills). The best image is the feed candidate (rank 1), the runner-up is rank 2. `scripts/preselect-images.ts` is idempotent (`analyzed_at`), runs as a backfill over all products and as the step after ingestion for new ones (it only touches unanalysed images). Only ~6 images per product are analysed; all images come from the stored raw payloads, no re-crawl.
- **AI sees one image.** `scripts/classify.ts` reads the queue (`claim_classification_batch`, `for update skip locked`, stale locks re-claimed after 10 min, max 3 attempts) and sends only the pre-selected image plus title/brand to Flash-Lite. If `feed_suitability` < 0.5 (or the JSON is invalid) it retries once with the runner-up and keeps the better result. Idempotent via `product_classifications(product, taxonomy_version, model)` plus an `input_hash`; unchanged inputs are never sent again. A hard cost cap stops the run. Model name/version, tokens and cost are stored on every row. The job is a batch script; nothing in the web app can start it or spend money (the web token is read-only on the gateway).
- **feed_ready.** `feed_ready = !has_model AND !needs_cutout AND feed_suitability >= 0.7` (config `FEED_READY_MIN_SUITABILITY`). Otherwise `image_status = needs_image_work` with `image_reason` = `has_model | needs_cutout | low_suitability`. ALL products are classified (attributes are needed anyway), but only `feed_ready` products are eligible for the feed. Partial index `products_feed_ready_idx (feed_slot, gender, id) where feed_ready`.
- **Later: image work job (not built).** Products with `needs_image_work` get processed by a separate background job (background removal / cutout or regeneration), the result is stored in OUR OWN storage (rights, speed, stable URLs), the product gets a new `feed_image_url`, and `feed_ready` flips to true. Nothing else changes.
- **Embeddings** are made from the final chosen image (1536 dims, L2-normalized) with an HNSW cosine index (`product_embeddings_hnsw_idx`).
- **Cost levers at scale:** Gemini batch mode (50% off), a cheaper model, lower image resolution (`mediaResolution`), context caching for the long static prompt, and classifying each product once.

## Test results: 200 products (taxonomy v2, gemini-3.5-flash-lite), 2026-10-19

- 201 classified (incl. product #10), 0 failures, JSON invalid on the first try in 3 of 303 calls (~1%), always fixed by the single retry.
- Cost: $0.0028 per product incl. runner-up retries (about 50% of products retry), plus $0.00012 for the image embedding. Cheaper `gemini-3.1-flash-lite` (the 2.5 Flash-Lite is closed to new users): $0.0019 per product, same feed_slot/category on 50/50 products, 96% same feed_ready.
- First image rejected by Gemini (suitability < 0.5) for 50% of products; the runner-up was better in 34 of 102 retries. Stores that only photograph on models (Fashion Nova, Armedangels, Gymshark, Outdoor Voices) are 11-44% feed_ready; stores with packshots (Taylor Stitch, Aimé Leon Dore, Kith, Allbirds, Pangaia, Rains) are 73-100%.
- Embedding neighbours (5 seeds) look visually sensible: jackets near shirt jackets/bombers, shoes near shoes, dresses near dresses. They also pick up photo style (Pangaia's warm-grey backdrop).
- Ideas not yet tested: `mediaResolution` low (image tokens are ~half of the input), context caching of the static prompt, skipping the runner-up retry for model-only shops, Gemini batch mode (-50%).

## Packshot stores, cheaper classification, backdrop tone (step 2, part 3)

- **Store selection is data-driven.** A store is only added if `/products.json` works AND a cheap vision check (`scripts/probe-models.ts`, 3.1 Flash-Lite, low resolution, ~$0.0003 per image) finds a model-free image among the first 5 images of most sampled products. Plain background is NOT enough (Mother Denim, AGOLDE, Good American, Studio Nicholson are plain but on models). `scripts/probe-store.ts` shows the gender/category mix. Adding a store stays one config line (`src/ingest/sources.ts`, options `brand`, `defaultGender`, `exclude`, `max`).
- **Default classifier is `gemini-3.1-flash-lite`** (`DRAPE_MODEL_CLASSIFIER` to change) with `mediaResolution: low` (`DRAPE_MEDIA_RES`). Low resolution cut input from ~2,040 to ~1,290 tokens per call: same feed_slot / category / has_model / feed_ready on 50/50 products, pattern 98%, colour 96%, fit 94%, material 92% agreement.
- **Retry policy is derived from data, not hardcoded.** `store_retry_policy()` looks at past classifications per store: if the first pick is rejected (suitability < 0.5) for >= 80% of products and the runner-up helped in <= 30% of the retries (needs >= 12 products), the runner-up retry is skipped for that store. New stores learn this from their first products.
- **Already classified = skipped.** A product with any v2 classification is never sent again (unless `--force`); the input hash also covers prompt revision, model and image resolution.
- **Backdrop tone.** Plain light-neutral backdrops (e.g. Pangaia's warm grey) count as feed_ready. `product_images.bg_color` (median border colour) and `whiten_factor` (CSS `filter: brightness(x)` that turns the backdrop white; capped at 1.3) are stored, copied to `products.feed_bg_color / feed_whiten`. `mix-blend-mode: multiply` removes WHITE backdrops on a coloured page; for a grey backdrop on a white page use the brightness factor.
- **Brand clean-up without changing keys.** `brandKey`/`keyBrand`: the display brand can be renamed (Gymshark) while the canonical key keeps using the old string, so re-ingest never creates duplicates. Existing rows were updated with an idempotent `update ... where brand like 'Gymshark |%'`.
- **Scale levers for the classification job:** parallel workers are safe (`for update skip locked`); cost per product is ~$0.0011-0.0013; Gemini batch mode (-50%) is the next lever for the million-product run.
- **Operational note:** the Supabase MCP tool hangs on destructive SQL (DROP/DELETE/TRUNCATE); migrations are written without them.

## Results: full classification (taxonomy v2, 3.1 Flash-Lite, low resolution), 2026-10-19

- 8,558 active products, ALL classified (0 failures, 0 invalid JSON rows), 8,558 image embeddings. 7,118 (83%) are feed_ready; 1,377 need image work because a model is in the photo, 39 low suitability, 24 need a cutout.
- Cost of the full run: $9.75 classification + $0.99 embeddings (incl. the first 201 products on 3.5 Flash-Lite, $0.57). About $0.0013 per product. 8,357 products in ~50 min with 2 parallel workers (~2.8 products/s); the data-derived retry policy skipped the runner-up retry for Fashion Nova, Armedangels and Gymshark (~470 saved calls).
- feed_ready per slot (AI gender): top men 1,340 / women 1,304; bottom men 414 / women 660; shoes men 322 / women 996; full_body women 455 (men 18: men's sets/jumpsuits barely exist in these shops). Unisex items: top 689, bottom 116, shoes 406.
- Weak spots: stores that only photograph on models (Armedangels 2%, Gymshark 8%, Fashion Nova 14%, The Frankie Shop 22%, Outdoor Voices 23%); the free pre-selection only keeps 2 candidates per product, so a packshot at position 3-5 is never seen. Quick wins: keep 3 candidates, and retry when suitability < 0.7 (not only < 0.5) for stores where the runner-up usually helps (Noah, Kith, Khaite).
