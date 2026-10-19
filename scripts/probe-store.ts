// Probe candidate Shopify stores: does /products.json work, what is the gender/category mix, and are the
// first images plain-background packshots? Low request rate (1 products.json page + ~40 thumbnails per store).
// Usage: npx tsx scripts/probe-store.ts host1 host2 ...   (writes JSON lines to stdout)
import { ShopifyAdapter } from "../src/ingest/adapters/shopify";
import { politeGetJson } from "../src/ingest/http";
import { pixelStats, viewHint } from "../src/images/score";

(async () => {
  for (const host of process.argv.slice(2)) {
    const base = `https://${host}`;
    const out: Record<string, unknown> = { host };
    try {
      let currency = "USD";
      try { currency = (await politeGetJson<{ currency?: string }>(`${base}/meta.json`)).currency ?? "USD"; } catch { /* default */ }
      const adapter = new ShopifyAdapter({ slug: host, name: host, kind: "shopify", baseUrl: base, options: { currency } });
      const page = await adapter.fetchPage(null);
      const norm = page.items.map((r) => ({ r, n: adapter.normalize(r) })).filter((x) => x.n && x.n.category !== "other" && x.n.gender !== "kids");
      const g: Record<string, number> = {}, c: Record<string, number> = {};
      for (const { n } of norm) { g[n!.gender ?? "none"] = (g[n!.gender ?? "none"] ?? 0) + 1; const k = `${n!.gender ?? "x"}/${n!.category}`; c[k] = (c[k] ?? 0) + 1; }
      // pixel check on the first image of up to 40 products (spread across the list)
      const step = Math.max(1, Math.floor(norm.length / 40));
      const sample = norm.filter((_, i) => i % step === 0).slice(0, 40);
      let plain = 0, tested = 0, modelHint = 0;
      for (const { n } of sample) {
        const url = n!.images[0]?.url; if (!url) continue;
        try { const px = await pixelStats(url); if (px) { tested++; if (px.bg >= 0.6) plain++; } } catch { /* skip */ }
        if (viewHint(url, null) === "model") modelHint++;
      }
      Object.assign(out, { ok: true, currency, page1: page.items.length, usable: norm.length, more: page.next != null, genders: g, cats: c,
        vendor: [...new Set(norm.slice(0, 40).map((x) => (x.r.payload as { vendor: string }).vendor))].slice(0, 3),
        plain_share: tested ? +(plain / tested).toFixed(2) : null, tested, model_hint: modelHint,
        sample_images: sample.slice(0, 16).map(({ n }) => n!.images[0].url) });
    } catch (e) { Object.assign(out, { ok: false, error: String(e).slice(0, 120) }); }
    console.log(JSON.stringify(out));
  }
})();
