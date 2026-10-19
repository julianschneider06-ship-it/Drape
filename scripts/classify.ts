// Classification job (taxonomy v2). Background batch, never run from a web request.
// Usage: npx tsx scripts/classify.ts [--sample] [--ids 1,2,3] [--model <id>] [--cap 0.8] [--concurrency 6]
//        [--limit N] [--print-prompt <id>] [--res low|medium|high] [--no-product-update]
// Reads the classification queue, sends ONLY the pre-selected image (plus title/brand), is idempotent per
// (product, taxonomy, model, input hash), retries with backoff, stores model/version/tokens/cost.
// Needs GEMINI_API_KEY and DRAPE_PIPELINE_TOKEN in the environment (never in the repo).
import Ajv from "ajv";
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import {
  EMBEDDING_IMAGE_PRICE_PER_M, FEED_READY_MIN_SUITABILITY, PRICES, RETRY_BELOW_SUITABILITY,
} from "../src/config/models";
import { GEMINI_API_BASE, MODELS } from "../src/config/models";
import { rpc } from "../src/ingest/gateway";
import { CLASSIFICATION_SCHEMA, PROMPT, TAXONOMY_VERSION } from "../src/classify/taxonomy-v2";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n: string) => args.includes(`--${n}`);

const KEY = process.env.GEMINI_API_KEY!;
const MODEL = opt("model") ?? MODELS.classifier;
const CAP = Number(opt("cap") ?? 0.8);
const CONCURRENCY = Number(opt("concurrency") ?? 6);
const LIMIT = Number(opt("limit") ?? Infinity);
const RES = opt("res"); // optional media resolution for the image tokens
const UPDATE_PRODUCT = !flag("no-product-update") && MODEL === MODELS.classifier; // only the primary model drives feed fields
const EMBED_DIMS = 1536;
const LOG = process.env.DRAPE_CLASSIFY_LOG; // optional JSONL log of every product result
const price = PRICES[MODEL];
if (!price) throw new Error(`No price known for model ${MODEL}; add it to PRICES in src/config/models.ts`);

const validate = new Ajv({ strict: false }).compile(CLASSIFICATION_SCHEMA);
const sha = (s: string) => createHash("sha1").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gemini(path: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const t0 = Date.now();
    const res = await fetch(`${GEMINI_API_BASE}/${path}`, {
      method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    }).catch((e) => e as Error);
    if (res instanceof Error) { if (attempt >= 4) throw res; await sleep(2000 * 2 ** attempt); continue; }
    if (res.ok) return { json: await res.json(), ms: Date.now() - t0 };
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

async function download(url: string) {
  const small = url + (url.includes("?") ? "&" : "?") + "width=1024"; // CDN resize: fewer bytes, same product
  let res = await fetch(small).catch(() => null);
  if (!res?.ok) res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  return { mime: res.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", b64: Buffer.from(await res.arrayBuffer()).toString("base64") };
}

interface Attempt {
  url: string; attrs: Record<string, any> | null; valid: boolean; errors?: unknown; ms: number; cost: number;
  usage: Record<string, any>; modelVersion?: string; img: { mime: string; b64: string };
}

async function classifyImage(p: { brand: string; name: string }, url: string): Promise<Attempt> {
  const img = await download(url);
  let cost = 0, ms = 0, usage: Record<string, any> = {}, modelVersion: string | undefined;
  for (let tries = 0; tries < 2; tries++) { // one retry if the JSON does not validate
    const gen = await gemini(`models/${MODEL}:generateContent`, {
      contents: [{ parts: [{ text: PROMPT(p) }, { inline_data: { mime_type: img.mime, data: img.b64 } }] }],
      generationConfig: {
        responseMimeType: "application/json", responseJsonSchema: CLASSIFICATION_SCHEMA, temperature: 0.2,
        ...(RES ? { mediaResolution: `MEDIA_RESOLUTION_${RES.toUpperCase()}` } : {}),
      },
    });
    const u = gen.json.usageMetadata ?? {};
    cost += ((u.promptTokenCount ?? 0) * price.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * price.out) / 1e6;
    ms += gen.ms; usage = u; modelVersion = gen.json.modelVersion;
    const text: string = (gen.json.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
    let attrs: Record<string, any> | null = null, valid = false, errors: unknown = "no output";
    try { attrs = JSON.parse(text); valid = validate(attrs) as boolean; errors = validate.errors; } catch (e) { errors = String(e); }
    if (valid || tries === 1) return { url, attrs, valid, errors, ms, cost, usage, modelVersion, img };
  }
  throw new Error("unreachable");
}

async function embed(img: { mime: string; b64: string }) {
  const r = await gemini(`models/${MODELS.embedding}:embedContent`, {
    content: { parts: [{ inline_data: { mime_type: img.mime, data: img.b64 } }] }, output_dimensionality: EMBED_DIMS,
  });
  const raw: number[] = r.json.embedding.values;
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0));
  const tokens: number = r.json.usageMetadata?.promptTokenCount ?? 258;
  return { vec: raw.map((x) => x / norm), tokens, cost: (tokens * EMBEDDING_IMAGE_PRICE_PER_M) / 1e6, usage: r.json.usageMetadata };
}

const stats = { claimed: 0, classified: 0, skipped_unchanged: 0, failed: 0, invalid_json_first_try: 0, retried_runner_up: 0,
  runner_up_better: 0, cost: 0, embed_cost: 0, ms: 0, in_tokens: 0, out_tokens: 0, feed_ready: 0, capped: false };
let modelVersionMeta: string | undefined, embVersionMeta: string | undefined;

async function processProduct(item: any, q: { id: number }) {
  const images: { url: string; rank: number }[] = item.images;
  if (!images.length) throw new Error("no pre-selected image");
  const hash = sha([TAXONOMY_VERSION, MODEL, item.brand, item.name, ...images.map((i) => i.url), RES ?? ""].join("|"));
  if (item.existing_hash === hash) { stats.skipped_unchanged++; await rpc("queue_finish", { p_id: q.id, p_ok: true, p_error: null }); return; }

  const attempts: Attempt[] = [await classifyImage(item, images[0].url)];
  if (!attempts[0].valid) stats.invalid_json_first_try++;
  const first = attempts[0].attrs?.feed_suitability ?? 0;
  if ((!attempts[0].valid || first < RETRY_BELOW_SUITABILITY) && images[1]) {
    stats.retried_runner_up++;
    attempts.push(await classifyImage(item, images[1].url));
  }
  const valid = attempts.filter((a) => a.valid);
  if (!valid.length) throw new Error(`no valid JSON: ${JSON.stringify(attempts[attempts.length - 1].errors).slice(0, 200)}`);
  const best = valid.reduce((a, b) => ((b.attrs!.feed_suitability ?? 0) > (a.attrs!.feed_suitability ?? 0) ? b : a));
  if (best !== attempts[0] && attempts.length > 1) stats.runner_up_better++;

  const emb = await embed(best.img);
  const a = best.attrs!;
  const ready = !a.has_model && !a.needs_cutout && a.feed_suitability >= FEED_READY_MIN_SUITABILITY;
  const reason = ready ? null : a.has_model ? "has_model" : a.needs_cutout ? "needs_cutout" : "low_suitability";
  const cost = attempts.reduce((s, x) => s + x.cost, 0);
  const ms = attempts.reduce((s, x) => s + x.ms, 0);

  await rpc("classification_store", { p: {
    product_id: item.id, queue_id: q.id, update_product: UPDATE_PRODUCT,
    classification: {
      taxonomy_version: TAXONOMY_VERSION, model: MODEL, model_version: modelVersionMeta, attributes: a, confidence: a.confidence, valid: true,
      usage: { ...best.usage, responseModelVersion: best.modelVersion, mediaResolution: RES ?? "default",
        attempts: attempts.map((x) => ({ image: x.url, valid: x.valid, feed_suitability: x.attrs?.feed_suitability ?? null, cost_usd: x.cost, in: x.usage.promptTokenCount, out: x.usage.candidatesTokenCount })) },
      cost_usd: cost, latency_ms: ms, source_image_url: best.url, input_hash: hash,
    },
    embedding: { model: MODELS.embedding, model_version: embVersionMeta, dims: EMBED_DIMS, embedding: `[${emb.vec.join(",")}]`,
      source_image_url: best.url, usage: emb.usage, cost_usd: emb.cost },
    feed: { feed_slot: a.feed_slot, feed_ready: ready, image_reason: reason, feed_image_url: best.url },
  } });

  stats.classified++; stats.cost += cost; stats.embed_cost += emb.cost; stats.ms += ms;
  for (const x of attempts) { stats.in_tokens += x.usage.promptTokenCount ?? 0; stats.out_tokens += (x.usage.candidatesTokenCount ?? 0) + (x.usage.thoughtsTokenCount ?? 0); }
  if (ready) stats.feed_ready++;
  if (LOG) appendFileSync(LOG, JSON.stringify({ id: item.id, model: MODEL, brand: item.brand, name: item.name, image: best.url, attempts: attempts.length,
    ready, reason, cost, ms, feed_slot: a.feed_slot, category: a.category, subcategory: a.subcategory, has_model: a.has_model, view: a.view,
    background: a.background, suitability: a.feed_suitability, needs_cutout: a.needs_cutout }) + "\n");
}

(async () => {
  if (opt("print-prompt")) {
    const [it] = await rpc<any[]>("classify_inputs", { p_ids: [Number(opt("print-prompt"))], p_tax: TAXONOMY_VERSION, p_model: MODEL });
    console.log(PROMPT(it));
    return;
  }
  modelVersionMeta = (await (await fetch(`${GEMINI_API_BASE}/models/${MODEL}`, { headers: { "x-goog-api-key": KEY } })).json()).version;
  embVersionMeta = (await (await fetch(`${GEMINI_API_BASE}/models/${MODELS.embedding}`, { headers: { "x-goog-api-key": KEY } })).json()).version;

  let ids: number[] | undefined = opt("ids")?.split(",").map(Number);
  if (flag("sample")) {
    const quotas = JSON.parse(opt("quotas") ?? '{"tops":45,"bottoms":40,"dresses":20,"outerwear":35,"shoes":35,"accessories":25}');
    ids = await rpc<number[]>("pick_classification_sample", { p_quotas: quotas });
  }
  if (ids) console.log(`enqueued ${await rpc("queue_enqueue", { p_ids: ids, p_tax: TAXONOMY_VERSION })} of ${ids.length} products`);

  const t0 = Date.now();
  while (stats.claimed < LIMIT) {
    if (stats.cost + stats.embed_cost >= CAP) { stats.capped = true; console.log(`COST CAP $${CAP} reached, stopping`); break; }
    const claimed = await rpc<{ id: number; product_id: number }[]>("claim_classification_batch", { p_n: Math.min(CONCURRENCY, LIMIT - stats.claimed), p_tax: TAXONOMY_VERSION });
    if (!claimed.length) break;
    stats.claimed += claimed.length;
    const inputs = await rpc<any[]>("classify_inputs", { p_ids: claimed.map((c) => c.product_id), p_tax: TAXONOMY_VERSION, p_model: MODEL });
    await Promise.all(claimed.map(async (q) => {
      const item = inputs.find((i) => i.id === q.product_id);
      try { await processProduct(item, q); }
      catch (e) {
        stats.failed++;
        console.error(`product ${q.product_id} failed: ${String(e).slice(0, 200)}`);
        await rpc("queue_finish", { p_id: q.id, p_ok: false, p_error: String(e).slice(0, 500) });
      }
    }));
    console.log(`claimed ${stats.claimed} classified ${stats.classified} failed ${stats.failed} cost $${(stats.cost + stats.embed_cost).toFixed(4)} (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  console.log(JSON.stringify({ model: MODEL, taxonomy: TAXONOMY_VERSION, ...stats, total_cost: stats.cost + stats.embed_cost, wall_seconds: (Date.now() - t0) / 1000 }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
