// For candidate Shopify stores: how many products have a model-free (packshot) image among their first 5 images?
// Cheap vision check (3.1 Flash-Lite, low resolution, ~$0.0003 per image). Usage: npx tsx scripts/probe-models.ts host...
import { GEMINI_API_BASE, MODELS } from "../src/config/models";
import { ShopifyAdapter } from "../src/ingest/adapters/shopify";
import { politeGetJson } from "../src/ingest/http";

const KEY = process.env.GEMINI_API_KEY!;
const SCHEMA = { type: "object", additionalProperties: false, required: ["person"], properties: { person: { type: "boolean" } } };

async function person(url: string): Promise<boolean | null> {
  try {
    const r = await fetch(url + (url.includes("?") ? "&" : "?") + "width=512");
    const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    const res = await fetch(`${GEMINI_API_BASE}/models/${MODELS.classifier}:generateContent`, {
      method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Is a person (or mannequin body, or visible body part wearing the item) visible in this fashion product image? Reply JSON {person: boolean}." }, { inline_data: { mime_type: r.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", data: b64 } }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, mediaResolution: "MEDIA_RESOLUTION_LOW", temperature: 0 } }),
    });
    const j = await res.json();
    return JSON.parse(j.candidates[0].content.parts[0].text).person;
  } catch { return null; }
}

(async () => {
  for (const host of process.argv.slice(2)) {
    const base = `https://${host}`;
    try {
      let currency = "USD";
      try { currency = (await politeGetJson<{ currency?: string }>(`${base}/meta.json`)).currency ?? "USD"; } catch { /* default */ }
      const adapter = new ShopifyAdapter({ slug: host, name: host, kind: "shopify", baseUrl: base, options: { currency } });
      const page = await adapter.fetchPage(null);
      const norm = page.items.map((r) => adapter.normalize(r)).filter((n) => n && n.category !== "other" && n.gender !== "kids");
      const step = Math.max(1, Math.floor(norm.length / 8));
      const picks = norm.filter((_, i) => i % step === 0).slice(0, 8);
      let first = 0, any = 0, tested = 0;
      await Promise.all(picks.map(async (n) => {
        const res = await Promise.all(n!.images.slice(0, 5).map((i) => person(i.url)));
        const ok = res.filter((x) => x !== null);
        if (!ok.length) return;
        tested++;
        if (res[0] === false) first++;
        if (ok.some((x) => x === false)) any++;
      }));
      console.log(JSON.stringify({ host, tested, first_image_packshot: tested ? +(first / tested).toFixed(2) : null, any_of_first5_packshot: tested ? +(any / tested).toFixed(2) : null }));
    } catch (e) { console.log(JSON.stringify({ host, error: String(e).slice(0, 80) })); }
  }
})();
