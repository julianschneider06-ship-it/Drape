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
