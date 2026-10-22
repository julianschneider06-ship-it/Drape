// Pre-import usability sample for a candidate accessory shop: 20 products spread over families, first image, acc1 classification (no store, nothing written to the database),
// images saved to --out for the local cutout check (scripts/cutout/sample_cutout.py). Prints the share that passes the has_model / suitability gate.
//   GEMINI_API_KEY=... npx tsx scripts/probe-usable.ts <host> --out <dir> [--n 20] [--country US]
import Ajv from "ajv";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { GEMINI_API_BASE, MODELS, PRICES } from "../src/config/models";
import { startStep } from "../src/lib/budget";
import { politeGetJson } from "../src/ingest/http";
import { ACC_SCHEMA, PROMPT } from "../src/classify/taxonomy-acc1";

const args = process.argv.slice(2);
const host = args[0]; const opt = (n: string, d?: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const out = opt("out")!, N = Number(opt("n", "20")), country = opt("country", "US");
const FAM: [string, RegExp][] = [["hair", /\b(hair|clip|claw|barrette|scrunchie|headband|bandana)\b/i], ["head", /\b(hats?|caps?|beanies?|beret|bucket)\b/i], ["belt", /\bbelts?\b/i], ["scarf", /\b(scarf|scarves|shawl)\b/i], ["watch", /\bwatch(es)?\b/i], ["earrings", /\b(earrings?|studs?|hoops?|huggies)\b/i], ["necklace", /\b(necklaces?|pendants?|chains?|chokers?)\b/i], ["bracelet", /\b(bracelets?|bangles?|cuffs?|anklets?)\b/i], ["ring", /\brings?\b/i]];
const NOT = /\b(gift|card|sticker|sample|insurance|box|pouch|care|cleaner|set of|bundle|kit)\b/i;
const model = MODELS.classifier, price = PRICES[model];
const validate = new Ajv({ strict: false }).compile(ACC_SCHEMA);
(async () => {
  startStep({ name: `probe-usable ${host}`, capEnv: "DRAPE_PROBE_CAP_USD", capDefault: 0.1, unitUsd: 0.0006, items: N });
  mkdirSync(out, { recursive: true });
  type P = { title: string; product_type: string; images: { src: string }[]; variants: { price: string; compare_at_price: string | null; available: boolean }[] };
  const prods: P[] = [];
  for (let page = 1; page <= 2; page++) { const d = await politeGetJson<{ products: P[] }>(`https://${host}/products.json?limit=250&page=${page}&country=${country}`, { minDelayMs: 1500, retries: 2 }); prods.push(...d.products); if (d.products.length < 250) break; }
  const by: Record<string, P[]> = {};
  for (const p of prods) { if (!p.images?.[0] || NOT.test(p.title) || !p.variants.some((v) => v.available)) continue; const f = FAM.find(([, r]) => r.test(`${p.title} ${p.product_type}`))?.[0]; if (f) (by[f] ??= []).push(p); }
  const pick: P[] = []; const keys = Object.keys(by);
  for (let i = 0; pick.length < N && keys.some((k) => by[k][i]); i++) for (const k of keys) { const p = by[k][Math.floor(i * by[k].length / Math.ceil(N / keys.length))]; if (p && pick.length < N && !pick.includes(p)) pick.push(p); }
  const rows: Record<string, unknown>[] = []; let cost = 0;
  for (const [i, p] of pick.entries()) {
    const url = p.images[0].src + (p.images[0].src.includes("?") ? "&" : "?") + "width=800";
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    writeFileSync(`${out}/${i}.png`, await sharp(buf).flatten({ background: "#fff" }).png().toBuffer());
    const b64 = (await sharp(buf).flatten({ background: "#fff" }).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 82 }).toBuffer()).toString("base64");
    const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT({ brand: host, name: p.title, subcategory: p.product_type }) }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: ACC_SCHEMA, temperature: 0.2, mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "minimal" } } }) });
    const g = await res.json() as { usageMetadata?: Record<string, number>; candidates?: { content: { parts: { text?: string }[] } }[] };
    const u = g.usageMetadata ?? {}; cost += ((u.promptTokenCount ?? 0) * price.in + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * price.out) / 1e6;
    let a: Record<string, unknown> | null = null; try { a = JSON.parse((g.candidates?.[0]?.content.parts ?? []).map((x) => x.text ?? "").join("")); } catch { /* invalid */ }
    const ok = !!a && validate(a);
    const gate = ok && !a!.has_model && (a!.feed_suitability as number) >= 0.6 && !["not_fashion", "excluded_for_now"].includes(a!.accessory_type as string);
    rows.push({ i, title: p.title.slice(0, 50), price: p.variants[0].price, type: a?.accessory_type, has_model: a?.has_model, suit: a?.feed_suitability, items: a?.item_count, gender: a?.gender, gate });
  }
  console.log(JSON.stringify({ host, sampled: pick.length, gate_pass: rows.filter((r) => r.gate).length, cost_usd: Number(cost.toFixed(4)), rows }));
})();
