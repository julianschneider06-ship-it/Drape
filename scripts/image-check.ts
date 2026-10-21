// Image check job (background, idempotent, resumable). Usage:
//   GEMINI_API_KEY=... DRAPE_PIPELINE_TOKEN=... npx tsx scripts/image-check.ts [--slot shoes]... [--limit N] [--cap 6] [--concurrency 8] [--model <id>]
// For every feed-ready product whose current feed image has been through the cutout job and has no check for this model yet:
// sends the cutout (or the original if there is none) at low resolution to a cheap multimodal model, stores the verdict,
// and for failed images switches the product to its next best image (the cutout job + this job then process the new image).
// The database enforces "once per product and image" (product_image_checks unique key). Hard cost cap via --cap (USD, whole table).
import Ajv from "ajv";
import sharp from "sharp";
import { GEMINI_API_BASE, MODELS, PRICES } from "../src/config/models";
import { rpc } from "../src/ingest/gateway";
import { IMAGE_CHECK_REV, IMAGE_CHECK_SCHEMA, MIN_CONFIDENCE, PROMPT, SERIOUS_DEFECTS } from "../src/imagecheck/schema";

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const many = (n: string) => args.flatMap((a, i) => (a === `--${n}` ? [args[i + 1]] : []));
const KEY = process.env.GEMINI_API_KEY;
const MODEL = opt("model") ?? MODELS.imageCheck;
const CAP = Number(opt("cap") ?? process.env.DRAPE_IMAGE_CHECK_CAP_USD ?? 6);
const CONCURRENCY = Number(opt("concurrency") ?? 8);
const LIMIT = Number(opt("limit") ?? Infinity);
const BATCH = 40;
const SLOTS = many("slot").length ? many("slot") : ["shoes", "bottom", "top", "full_body", "accessory"];
const price = PRICES[MODEL];
if (!KEY) throw new Error("GEMINI_API_KEY is not set");
if (!price) throw new Error(`No price known for model ${MODEL}; add it to PRICES in src/config/models.ts`);

const validate = new Ajv({ strict: false }).compile(IMAGE_CHECK_SCHEMA);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let modelVersion: string | undefined;

async function gemini(body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GEMINI_API_BASE}/models/${MODEL}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": KEY!, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000),
    }).catch((e) => e as Error);
    if (res instanceof Error) { if (attempt >= 4) throw res; await sleep(2000 * 2 ** attempt); continue; }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await sleep(2000 * 2 ** attempt); continue; }
    throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

// Download, put on white (cutouts are transparent), shrink: the check needs no detail, so ~512 px keeps the token cost minimal.
async function prepare(url: string): Promise<string> {
  const u = url.includes("cdn.shopify.com") ? url + (url.includes("?") ? "&" : "?") + "width=800" : url;
  const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const buf = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: "#ffffff" }).resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
  return buf.toString("base64");
}

interface Todo { id: number; slot: string; url: string; checked_url: string }

async function check(t: Todo) {
  let b64: string;
  try { b64 = await prepare(t.checked_url); } catch (e) {
    // image gone from the shop / storage (404 etc.): a failed image like any other, so the next candidate is tried
    if (/image (4\d\d)/.test(String(e))) return { id: t.id, src: t.url, checked_url: t.checked_url, model: MODEL, model_version: null, item_count: 0, is_single: false, defects: [] as string[], confidence: 1, verdict: "fail", reason: "image_missing", usage: { rev: IMAGE_CHECK_REV }, cost: 0, presentation: null as string | null };
    throw e;
  }
  let cost = 0, usage: Record<string, unknown> = {}, out: { item_count: number; is_single_product: boolean; defects: string[]; presentation: string; confidence: number } | null = null;
  for (let tries = 0; tries < 2 && !out; tries++) {
    const gen = await gemini({
      contents: [{ parts: [{ text: PROMPT({ slot: t.slot }) }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: IMAGE_CHECK_SCHEMA, temperature: 0, mediaResolution: "MEDIA_RESOLUTION_LOW" },
    });
    const u = gen.usageMetadata ?? {};
    cost += ((u.promptTokenCount ?? 0) * price.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * price.out) / 1e6;
    usage = u; modelVersion = gen.modelVersion ?? modelVersion;
    try {
      const text: string = (gen.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
      const j = JSON.parse(text);
      if (validate(j)) out = j;
    } catch { /* retry once */ }
  }
  if (!out) throw new Error("invalid JSON from model");
  const serious = out.defects.filter((d) => SERIOUS_DEFECTS.has(d));
  const multi = !out.is_single_product || out.item_count > 1;
  let reason: string | null = null;
  if (out.item_count === 0) reason = "no_product";
  else if (multi) reason = "multi_item";
  else if (serious.length) reason = "defect:" + serious.join("+");
  else if (out.confidence < MIN_CONFIDENCE) reason = "low_confidence";
  return {
    id: t.id, src: t.url, checked_url: t.checked_url, model: MODEL, model_version: modelVersion ?? null,
    item_count: out.item_count, is_single: out.is_single_product && out.item_count === 1, defects: out.defects, confidence: out.confidence, presentation: t.slot === "shoes" || t.slot === "accessory" ? null : out.presentation,
    verdict: reason ? "fail" : "pass", reason, usage: { ...usage, rev: IMAGE_CHECK_REV, resolution: "low" }, cost,
  };
}

// Backfill of `presentation` for products that already passed the check (once per product and image, own cost cap).
async function presentationBackfill() {
  const PCAP = Number(opt("cap") ?? process.env.DRAPE_PRESENTATION_CAP_USD ?? 3);
  let spent = Number(await rpc<string>("presentation_cost"));
  let after = 0, done = 0, errors = 0; const t0 = Date.now(); const counts: Record<string, number> = {};
  console.log(`presentation backfill: model ${MODEL}, cap $${PCAP}, already spent $${spent.toFixed(4)}`);
  while (done < LIMIT && spent < PCAP) {
    const todo = await rpc<Todo[]>("presentation_todo", { p_after: after, p_limit: Math.min(BATCH, LIMIT - done) });
    if (!todo.length) break;
    after = todo[todo.length - 1].id;
    const items: object[] = []; let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) {
        if (spent >= PCAP) return;
        const t = todo[i++];
        try {
          const r = await check(t); spent += r.cost;
          if (r.presentation) { counts[r.presentation] = (counts[r.presentation] ?? 0) + 1; items.push({ id: t.id, src: t.url, model: MODEL, presentation: r.presentation, confidence: r.confidence, cost: r.cost }); }
        } catch (e) { errors++; console.error(`product ${t.id}: ${String(e).slice(0, 100)}`); }
      }
    }));
    if (items.length) await rpc("presentation_apply", { p_items: items });
    done += todo.length;
    console.log(`presentation ${done} ${JSON.stringify(counts)} errors ${errors} spent $${spent.toFixed(4)} ${((Date.now() - t0) / 1000) | 0}s`);
  }
  console.log("done", JSON.stringify({ done, counts, errors, spent_usd: Number(spent.toFixed(4)) }));
}

(async () => {
  if (args.includes("--presentation")) return presentationBackfill();
  let spent = Number(await rpc<string>("image_check_cost"));
  const t0 = Date.now();
  const tot = { checked: 0, pass: 0, fail: 0, switched: 0, excluded: 0, errors: 0 };
  const reasons: Record<string, number> = {};
  console.log(`image check: model ${MODEL}, cap $${CAP}, already spent $${spent.toFixed(4)}`);
  outer: for (const slot of SLOTS) {
    let after = 0;
    while (tot.checked < LIMIT) {
      const todo = await rpc<Todo[]>("image_check_todo", { p_slot: slot, p_after: after, p_limit: Math.min(BATCH, LIMIT - tot.checked), p_model: MODEL });
      if (!todo.length) break;
      after = todo[todo.length - 1].id;
      const results: Awaited<ReturnType<typeof check>>[] = [];
      let i = 0;
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        while (i < todo.length) {
          if (spent >= CAP) return;
          const t = todo[i++];
          try { const r = await check(t); spent += r.cost; results.push(r); } catch (e) { tot.errors++; console.error(`product ${t.id}: ${String(e).slice(0, 120)}`); }
        }
      }));
      if (results.length) {
        const a = await rpc<{ pass: number; switched: number; excluded: number }>("image_check_apply", { p_items: results });
        tot.checked += results.length; tot.pass += a.pass; tot.switched += a.switched; tot.excluded += a.excluded;
        for (const r of results) if (r.reason) reasons[r.reason.split(":")[0]] = (reasons[r.reason.split(":")[0]] ?? 0) + 1;
      }
      console.log(`[${slot}] checked ${tot.checked} pass ${tot.pass} switched ${tot.switched} excluded ${tot.excluded} errors ${tot.errors} reasons ${JSON.stringify(reasons)} spent $${spent.toFixed(4)} ${((Date.now() - t0) / 1000) | 0}s`);
      if (spent >= CAP) { console.log(`COST CAP $${CAP} reached - stopping (re-run later to continue)`); break outer; }
    }
  }
  console.log("done", JSON.stringify({ ...tot, reasons, spent_usd: Number(spent.toFixed(4)) }));
})();
