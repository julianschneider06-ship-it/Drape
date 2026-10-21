// Hood detection (background, idempotent): which tops / outer layers / dresses have a hood. Usage:
//   GEMINI_API_KEY=... DRAPE_PIPELINE_TOKEN=... npx tsx scripts/detect-hoods.ts [--cap 0.5] [--concurrency 8] [--limit N]
// Rules first (free): name has hood/parka/anorak... -> hood; neck narrower than 0.30 and no keyword -> no hood.
// Unclear tops (wide or unknown neck, no keyword) go to the cheap vision model at low resolution, once per image. Model/version/cost stored.
import Ajv from "ajv";
import sharp from "sharp";
import { GEMINI_API_BASE, MODELS, PRICES } from "../src/config/models";
import { rpc } from "../src/ingest/gateway";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const KEY = process.env.GEMINI_API_KEY;
const MODEL = opt("model") ?? MODELS.imageCheck;
const CAP = Number(opt("cap") ?? 0.5), CONC = Number(opt("concurrency") ?? 8), LIMIT = Number(opt("limit") ?? Infinity);
const price = PRICES[MODEL];
if (!KEY) throw new Error("GEMINI_API_KEY is not set");
if (!price) throw new Error(`No price known for model ${MODEL}`);
const KEYWORDS = /\b(hood|hooded|hoodie|parka|anorak|duffle|duffel|cagoule|windbreaker)\b/i;
const NARROW = 0.30;
const SCHEMA = { type: "object", properties: { has_hood: { type: "boolean" }, confidence: { type: "number", minimum: 0, maximum: 1 } }, required: ["has_hood", "confidence"], additionalProperties: false } as const;
const validate = new Ajv({ strict: false }).compile(SCHEMA);
const PROMPT = "This is a garment (top, jacket, coat or dress) cut out on a white background, seen from the front. Does it have a HOOD attached at the neck (a hood lying flat or hanging behind the neck counts)? A normal collar, a turtleneck or a funnel neck is NOT a hood. Answer has_hood and your confidence 0..1.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let version: string | undefined;

async function gemini(body: unknown) {
  for (let a = 0; ; a++) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${MODEL}:generateContent`, { method: "POST", headers: { "x-goog-api-key": KEY!, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }).catch((e) => e as Error);
    if (res instanceof Error) { if (a >= 4) throw res; await sleep(2000 * 2 ** a); continue; }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && a < 4) { await sleep(2000 * 2 ** a); continue; }
    throw new Error(`gemini ${res.status}`);
  }
}
async function prepare(url: string) {
  const u = url.includes("cdn.shopify.com") ? url + (url.includes("?") ? "&" : "?") + "width=800" : url;
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  return (await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 80 }).toBuffer()).toString("base64");
}
interface Todo { id: number; name: string; slot: string; collar: number | null; url: string }

async function main() {
  let spent = Number(await rpc<string>("hood_cost"));
  console.log(`hood detection: model ${MODEL}, cap $${CAP}, spent so far $${spent.toFixed(4)}`);
  const stats = { rule_hood: 0, rule_no: 0, model_hood: 0, model_no: 0, errors: 0 };
  let after = 0, done = 0, modelCost = 0;
  while (done < LIMIT) {
    const todo = await rpc<Todo[]>("hood_todo", { p_after: after, p_limit: 200 });
    if (!todo.length) break;
    after = todo[todo.length - 1].id; done += todo.length;
    const out: unknown[] = [];
    const ask: Todo[] = [];
    for (const t of todo) {
      if (KEYWORDS.test(t.name)) { stats.rule_hood++; out.push({ id: t.id, src: t.url, hood: true, model: "rule:name", version: "r1", cost: 0 }); }
      else if (t.collar != null && t.collar < NARROW) { stats.rule_no++; out.push({ id: t.id, src: t.url, hood: false, model: "rule:collar", version: "r1", cost: 0 }); }
      else ask.push(t);
    }
    let i = 0;
    await Promise.all(Array.from({ length: CONC }, async () => {
      for (;;) {
        const t = ask[i++]; if (!t) return;
        if (modelCost + spent >= CAP) return;
        try {
          const b64 = await prepare(t.url);
          const gen = await gemini({ contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, temperature: 0, mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "minimal" } } });
          const u = gen.usageMetadata ?? {}; version = gen.modelVersion ?? version;
          const cost = ((u.promptTokenCount ?? 0) * price.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * price.out) / 1e6;
          modelCost += cost;
          const j = JSON.parse((gen.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join(""));
          if (!validate(j)) throw new Error("invalid");
          if (j.has_hood) stats.model_hood++; else stats.model_no++;
          out.push({ id: t.id, src: t.url, hood: j.has_hood, model: MODEL, version: version ?? null, cost });
        } catch { stats.errors++; }
      }
    }));
    if (out.length) await rpc("hood_apply", { p_items: out });
    console.log(`seen ${done}`, JSON.stringify(stats), `model cost $${modelCost.toFixed(4)}`);
    if (modelCost + spent >= CAP) { console.log("cost cap reached"); break; }
  }
  console.log("done", JSON.stringify(stats), `spent $${(spent + modelCost).toFixed(4)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
