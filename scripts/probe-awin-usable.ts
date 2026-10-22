// Pre-import usability sample for Awin merchants (read-only, nothing stored): image-check prompt (ic2) on the feed image + free border-plainness test.
// Samples come from a temp json (merchant -> [{id,img,name,slot}]), never from the repo. Usage: GEMINI_API_KEY=... npx tsx scripts/probe-awin-usable.ts <samples.json>
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { GEMINI_API_BASE, MODELS, PRICES } from "../src/config/models";
import { startStep } from "../src/lib/budget";
import { IMAGE_CHECK_SCHEMA, MIN_CONFIDENCE, PROMPT, SERIOUS_DEFECTS } from "../src/imagecheck/schema";

const samples = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, { img: string; name: string; slot: string }[]>;
const model = MODELS.imageCheck;
const slotOf = (n: string) => /watch|ring|necklace|bracelet|earring|bag|belt|hat|cap\b|beanie|scarf|sunglass|glasses|glove/i.test(n) ? "accessory" : /shoe|boot|trainer|sneaker|sandal|loafer/i.test(n) ? "shoes" : /dress|jumpsuit/i.test(n) ? "full_body" : /trouser|pant|jean|short|chino|skirt|jogger/i.test(n) ? "bottom" : "top";
async function plain(buf: Buffer): Promise<number> {   // share of border pixels close to the corner colour (1 = plain background)
  const { data, info } = await sharp(buf).flatten({ background: "#fff" }).resize(100, 100, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = info.channels, px = (x: number, y: number) => [data[(y * w + x) * c], data[(y * w + x) * c + 1], data[(y * w + x) * c + 2]];
  const ref = px(1, 1); let n = 0, ok = 0;
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) { const p = px(x, y); n++; if (Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) < 60) ok++; }
  for (let y = 0; y < h; y++) for (const x of [0, 1, w - 2, w - 1]) { const p = px(x, y); n++; if (Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) < 60) ok++; }
  return ok / n;
}
(async () => {
  const total = Object.values(samples).reduce((a, s) => a + s.length, 0);
  startStep({ name: "probe-awin-usable", capEnv: "DRAPE_PROBE_CAP_USD", capDefault: 1.5, unitUsd: 0.0003, items: total });
  for (const [m, list] of Object.entries(samples)) {
    let pass = 0, done = 0; const why: Record<string, number> = {};
    for (const s of list) {
      try {
        const r = await fetch(s.img, { headers: { "User-Agent": "drape-probe" } });
        if (!r.ok) { why[`img${r.status}`] = (why[`img${r.status}`] ?? 0) + 1; done++; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        const pl = await plain(buf);
        const b64 = (await sharp(buf).flatten({ background: "#fff" }).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 82 }).toBuffer()).toString("base64");
        const res = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent`, { method: "POST", headers: { "x-goog-api-key": process.env.GEMINI_API_KEY!, "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT({ slot: slotOf(s.name) }) }, { inline_data: { mime_type: "image/jpeg", data: b64 } }] }], generationConfig: { responseMimeType: "application/json", responseJsonSchema: IMAGE_CHECK_SCHEMA, temperature: 0.1, mediaResolution: "MEDIA_RESOLUTION_LOW", thinkingConfig: { thinkingLevel: "minimal" } } }) });
        const g = await res.json() as { candidates?: { content: { parts: { text?: string }[] } }[] };
        const a = JSON.parse((g.candidates?.[0]?.content.parts ?? []).map((x) => x.text ?? "").join("")) as { item_count: number; is_single_product: boolean; defects: string[]; confidence: number };
        const bad = a.item_count !== 1 || a.defects.some((d) => SERIOUS_DEFECTS.has(d)) || a.confidence < MIN_CONFIDENCE ? (a.defects.find((d) => SERIOUS_DEFECTS.has(d)) ?? (a.item_count !== 1 ? "multi" : "lowconf")) : pl < 0.8 ? "busy_bg" : "";
        if (!bad) pass++; else why[bad] = (why[bad] ?? 0) + 1;
      } catch (e) { why.error = (why.error ?? 0) + 1; }
      done++;
    }
    console.log(JSON.stringify({ merchant: m, sampled: done, usable: pass, share: Math.round((100 * pass) / Math.max(done, 1)), why }));
  }
})();
