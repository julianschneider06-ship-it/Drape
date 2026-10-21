// Probe candidate Shopify stores for clothing / shoes: /products.json reachable, products per category and gender, plain-background (packshot) share of the first image.
// Low request rate (<= 3 products.json pages, 24 thumbnails per store). Usage: npx tsx scripts/probe-clothes.ts host1 host2 ...   (JSON lines on stdout)
import { politeGetJson } from "../src/ingest/http";
import { pixelStats } from "../src/images/score";
import { inferCategory, inferGender } from "../src/ingest/rules";

(async () => {
  for (const host of process.argv.slice(2)) {
    const base = `https://${host}`; const out: Record<string, unknown> = { host };
    try {
      const prods: { title: string; product_type: string; tags: string[] | string; vendor?: string; handle: string; images: { src: string }[]; variants: { price: string }[] }[] = [];
      for (let page = 1; page <= 3; page++) {
        const d = await politeGetJson<{ products: typeof prods }>(`${base}/products.json?limit=250&page=${page}`, { minDelayMs: 1500, retries: 1 });
        prods.push(...d.products); if (d.products.length < 250) break;
      }
      const cnt: Record<string, number> = {}; const vendors = new Set<string>(); const items: typeof prods = [];
      const prices: number[] = [];
      for (const p of prods) {
        const tags = Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags ?? "");
        const cat = inferCategory(p.product_type, p.title, tags);
        if (!["tops", "bottoms", "shoes", "outerwear", "dresses"].includes(cat) || !p.images?.length) continue;
        const g = inferGender(null, p.product_type, p.title, tags, p.handle) ?? "?";
        const k = `${g}:${cat}`; cnt[k] = (cnt[k] ?? 0) + 1; items.push(p); if (p.vendor) vendors.add(p.vendor);
        const pr = Number(p.variants?.[0]?.price); if (pr > 0) prices.push(pr);
      }
      const step = Math.max(1, Math.floor(items.length / 24)); let plain = 0, tested = 0;
      for (const p of items.filter((_, i) => i % step === 0).slice(0, 24)) { try { const px = await pixelStats(p.images[0].src); if (px) { tested++; if (px.bg >= 0.6) plain++; } } catch { /* skip */ } }
      prices.sort((a, b) => a - b);
      Object.assign(out, { ok: true, total: prods.length, clothes: items.length, vendors: vendors.size, counts: cnt, plain_share: tested ? +(plain / tested).toFixed(2) : null, price_p10_p90: prices.length ? [prices[Math.floor(prices.length * 0.1)], prices[Math.floor(prices.length * 0.9)]] : null, sample: items.slice(0, 3).map((p) => p.title.slice(0, 40)) });
    } catch (e) { Object.assign(out, { ok: false, error: String(e).slice(0, 100) }); }
    console.log(JSON.stringify(out));
  }
})();
