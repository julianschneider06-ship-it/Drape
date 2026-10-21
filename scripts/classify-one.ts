// Classify ONE product (image + title) and embed its image. Usage: npx tsx scripts/classify-one.ts <product_id>
// Needs GEMINI_API_KEY and DRAPE_PIPELINE_TOKEN in the environment.
import Ajv from "ajv";
import { startStep } from "../src/lib/budget";
import { GEMINI_API_BASE, MODELS } from "../src/config/models";
import { CLASSIFICATION_SCHEMA, PROMPT, TAXONOMY_VERSION } from "../src/classify/taxonomy";

const KEY = process.env.GEMINI_API_KEY!;
const PIPE = process.env.DRAPE_PIPELINE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co/functions/v1/pipeline";
const EMBED_DIMS = 1536;
// Paid-tier standard list prices, USD per 1M tokens (ai.google.dev/gemini-api/docs/pricing, 2026-10-19).
const PRICE = { in: 0.3, out: 2.5, embedImage: 0.45 };

const gemini = async (path: string, body: unknown) => {
  const t0 = Date.now();
  const res = await fetch(`${GEMINI_API_BASE}/${path}`, {
    method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(json).slice(0, 400)}`);
  return { json, ms: Date.now() - t0 };
};
const pipe = async (body: unknown) => {
  const res = await fetch(PIPE, { method: "POST", headers: { authorization: `Bearer ${process.env.DRAPE_PIPELINE_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`pipeline: ${res.status} ${JSON.stringify(json)}`);
  return json;
};

(async () => {
  const id = Number(process.argv[2]);
  startStep({ name: "classify-one", capEnv: "DRAPE_CLASSIFY_ONE_CAP_USD", capDefault: 0.05, unitUsd: 0.0015, items: 1 });
  const { product } = await pipe({ action: "product_get", id });
  const imgRes = await fetch(product.primary_image_url);
  const mime = imgRes.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
  const image = { inline_data: { mime_type: mime, data: b64 } };

  // 1) classification
  const gen = await gemini(`models/${MODELS.classifier}:generateContent`, {
    contents: [{ parts: [{ text: PROMPT(product) }, image] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: CLASSIFICATION_SCHEMA, temperature: 0.2 },
  });
  const text: string = gen.json.candidates[0].content.parts.map((p: { text?: string }) => p.text ?? "").join("");
  let attrs: unknown = null, valid = false, errors: unknown = null;
  try {
    attrs = JSON.parse(text);
    const validate = new Ajv({ strict: false }).compile(CLASSIFICATION_SCHEMA);
    valid = validate(attrs) as boolean;
    errors = validate.errors;
  } catch (e) { errors = String(e); }
  const u = gen.json.usageMetadata;
  const outTokens = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  const genCost = (u.promptTokenCount * PRICE.in + outTokens * PRICE.out) / 1e6;

  // 2) image embedding (truncate 3072 -> 1536 and L2-normalize, as required for truncated Gemini embeddings)
  const emb = await gemini(`models/${MODELS.embedding}:embedContent`, {
    content: { parts: [image] }, output_dimensionality: EMBED_DIMS,
  });
  const raw: number[] = emb.json.embedding.values;
  const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0));
  const vec = raw.map((x) => x / norm);
  const embTokens: number | undefined = emb.json.usageMetadata?.promptTokenCount ?? emb.json.usageMetadata?.totalTokenCount;
  const embCost = embTokens != null ? (embTokens * PRICE.embedImage) / 1e6 : 0.00012;

  const meta = await (await fetch(`${GEMINI_API_BASE}/models/${MODELS.classifier}`, { headers: { "x-goog-api-key": KEY } })).json();
  const embMeta = await (await fetch(`${GEMINI_API_BASE}/models/${MODELS.embedding}`, { headers: { "x-goog-api-key": KEY } })).json();

  const stored = await pipe({
    action: "classification_store",
    classification: {
      product_id: id, taxonomy_version: TAXONOMY_VERSION, model: MODELS.classifier, model_version: meta.version ?? null,
      attributes: attrs ?? { raw_text: text }, confidence: (attrs as { confidence?: number } | null)?.confidence ?? null, valid,
      usage: { ...u, responseModelVersion: gen.json.modelVersion }, cost_usd: genCost, latency_ms: gen.ms, source_image_url: product.primary_image_url,
    },
    embedding: {
      product_id: id, kind: "image", model: MODELS.embedding, model_version: embMeta.version ?? null, dims: EMBED_DIMS,
      embedding: `[${vec.join(",")}]`, source_image_url: product.primary_image_url, usage: emb.json.usageMetadata ?? null, cost_usd: embCost,
    },
  });

  console.log(JSON.stringify({
    product: { id, brand: product.brand, name: product.name, image: product.primary_image_url },
    classification: attrs, schema_valid: valid, validation_errors: errors,
    classifier: { model: MODELS.classifier, version: meta.version, usage: u, cost_usd: genCost, ms: gen.ms },
    embedding: { model: MODELS.embedding, version: embMeta.version, dims: vec.length, usage: emb.json.usageMetadata, cost_usd: embCost, ms: emb.ms, first5: vec.slice(0, 5) },
    total_cost_usd: genCost + embCost, total_ms: gen.ms + emb.ms, stored,
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
