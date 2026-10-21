// Accessory classification job (taxonomy acc1). Background batch, idempotent (one row per product + taxonomy + model), resumable,
// cheap model at low resolution, strict JSON, model/version/cost stored, hard cost cap. Main products (v2) are never touched.
//   GEMINI_API_KEY=... DRAPE_PIPELINE_TOKEN=... npx tsx scripts/classify-accessories.ts [--limit N] [--cap 3] [--concurrency 8] [--model <id>]
import Ajv from "ajv";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { GEMINI_API_BASE, MODELS, PRICES } from "../src/config/models";
import { rpc } from "../src/ingest/gateway";
import { ACC_SCHEMA, PROMPT, PROMPT_REV, TAXONOMY_VERSION } from "../src/classify/taxonomy-acc1";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const KEY = process.env.GEMINI_API_KEY;
const MODEL = opt("model") ?? MODELS.classifier;
const CAP = Number(opt("cap") ?? 3);
const CONCURRENCY = Number(opt("concurrency") ?? 8);
const LIMIT = Number(opt("limit") ?? Infinity);
const DESC = args.includes("--desc"); // newest products first (the accessory stores added last); default oldest first
const price = PRICES[MODEL];
if (!KEY) throw new Error("GEMINI_API_KEY is not set");
if (!price) throw new Error(`No price known for model ${MODEL}`);
const validate = new Ajv({ strict: false }).compile(ACC_SCHEMA);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha = (s: string) => createHash("sha1").update(s).digest("hex");
let modelVersion: string | undefined;

async function gemini(body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${MODEL}:generateContent`, { method: "POST", headers: { "x-goog-api-key": KEY!, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) }).catch((e) => e as Error);
    if (res instanceof Error) { if (attempt >= 4) throw res; await sleep(2000 * 2 ** attempt); continue; }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function prepare(url: string): Promise<string> {
  const u = url.includes("cdn.shopify.com") ? url + (url.includes("?") ? "&" : "?") + "width=800" : url;
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 82 }).toBuffer();
  return buf.toString("base64");
}

interface Todo { id: number; brand: string; name: string; subcategory: string | null; images: { url: string; rank: number }[] }

async function classify(t: Todo) {
  const img = t.images[0];
  if (!img) throw new Error("no image");
  const b64 = await prepare(img.url);
  let cost = 0, usage: Record<string, unknown> = {}, attrs: Record<string, unknown> | null = null, valid = false;
  const t0 = Date.now();
  for (let tries = 0; tries < 2 && !valid; tries++) {
    const gen = await gemini({
      contents: [{ parts: [{ text: PROMPT({ brand: t.brand, name: t.name, subcategory: t.subcategory }) }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: ACC_SCHEMA, temperature: 0.2, mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "minimal" } },
    });
    const u = gen.usageMetadata ?? {};
    cost += ((u.promptTokenCount ?? 0) * price.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * price.out) / 1e6;
    usage = u; modelVersion = gen.modelVersion ?? modelVersion;
    try { const text: string = (gen.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join(""); attrs = JSON.parse(text); valid = validate(attrs) as boolean; } catch { valid = false; }
  }
  return { id: t.id, tax: TAXONOMY_VERSION, model: MODEL, model_version: modelVersion ?? null, attributes: attrs, valid, usage: { ...usage, promptRev: PROMPT_REV, resolution: "low" }, cost, latency_ms: Date.now() - t0, source_image_url: img.url, input_hash: sha(`${PROMPT_REV}|${t.name}|${img.url}`) };
}

(async () => {
  const parked = await rpc<number>("acc_prefilter");
  let spent = Number(await rpc<string>("acc_cost", { p_tax: TAXONOMY_VERSION }));
  const t0 = Date.now(); let after = DESC ? Number.MAX_SAFE_INTEGER : 0, done = 0, invalid = 0, errors = 0; const types: Record<string, number> = {};
  console.log(`accessory classification ${TAXONOMY_VERSION}: model ${MODEL}, cap $${CAP}, spent so far $${spent.toFixed(4)}, parked by prefilter ${parked}`);
  while (done < LIMIT && spent < CAP) {
    const todo = DESC ? await rpc<Todo[]>("acc_todo_desc", { p_before: after, p_limit: Math.min(40, LIMIT - done), p_tax: TAXONOMY_VERSION }) : await rpc<Todo[]>("acc_todo", { p_after: after, p_limit: Math.min(40, LIMIT - done), p_tax: TAXONOMY_VERSION });
    if (!todo.length) break;
    after = todo[todo.length - 1].id;
    const out: Awaited<ReturnType<typeof classify>>[] = []; let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) {
        if (spent >= CAP) return;
        const t = todo[i++];
        try { const r = await classify(t); spent += r.cost; if (r.valid) { out.push(r); const k = (r.attributes as { accessory_type: string }).accessory_type; types[k] = (types[k] ?? 0) + 1; } else invalid++; } catch (e) { errors++; console.error(`product ${t.id}: ${String(e).slice(0, 100)}`); }
      }
    }));
    if (out.length) await rpc("acc_store", { p_items: out });
    done += todo.length;
    console.log(`classified ${done} types ${JSON.stringify(types)} invalid ${invalid} errors ${errors} spent $${spent.toFixed(4)} ${((Date.now() - t0) / 1000) | 0}s`);
  }
  console.log("done", JSON.stringify({ done, invalid, errors, types, spent_usd: Number(spent.toFixed(4)) }));
})();
