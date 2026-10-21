// Free image pre-selection backfill. Idempotent: only images without analyzed_at are processed.
// Runs as the step after ingestion (npm run ingest:all) and as a backfill. Usage: npx tsx scripts/preselect-images.ts [--limit-products N]
import { rpc } from "../src/ingest/gateway";
import { combine, pixelStats, type ImageIn, type ImageScore } from "../src/images/score";

const MAX_PER_PRODUCT = 6; // images analysed per product (shop order = importance)
const CONCURRENCY = 24;
const li = process.argv.indexOf("--limit-products");
const limit = li >= 0 ? Number(process.argv[li + 1]) : Infinity;

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

(async () => {
  // New products only carry the images the ingest normalizer kept; pull all of them (with alt text) from the raw payloads first.
  // new products only, in small batches (the full backfill scans every raw item and times out on a big catalogue)
  for (let n = 1; n > 0;) n = await rpc<number>("backfill_product_images_new", { p_products: 300 });
  let after = 0, products = 0, images = 0;
  const t0 = Date.now();
  while (products < limit) {
    const batch = await rpc<{ product_id: number; images: ImageIn[] }[]>("images_todo", { p_after: after, p_products: 40 });
    if (!batch.length) break;
    const results: ImageScore[] = [];
    const jobs = batch.flatMap((p) => p.images.slice(0, MAX_PER_PRODUCT).map((img) => ({ pid: p.product_id, img })));
    const scored = new Map<number, ImageScore[]>();
    await pool(jobs, CONCURRENCY, async ({ pid, img }) => {
      let px = null;
      try { px = await pixelStats(img.url); } catch { /* unreachable image: scored low, still marked analyzed */ }
      const s = combine(img, px);
      if (!px) s.score = Math.min(s.score, 0.05);
      (scored.get(pid) ?? scored.set(pid, []).get(pid)!).push(s);
    });
    for (const p of batch) {
      const list = (scored.get(p.product_id) ?? []).sort((a, b) => b.score - a.score);
      list.forEach((s, i) => { s.feed_rank = i + 1; results.push(s); });
      // images beyond the cap: mark analyzed with no rank so they are not picked up again
      for (const extra of p.images.slice(MAX_PER_PRODUCT)) results.push({ id: extra.id, bg_whiteness: null, object_fill: null, view_hint: "unknown", score: 0, feed_rank: 99, bg_color: null, whiten_factor: null });
      products++;
    }
    images += results.length;
    await rpc("images_apply", { p_items: results });
    after = batch[batch.length - 1].product_id;
    console.log(`products ${products}, images ${images}, ${(((Date.now() - t0) / 1000) | 0)}s`);
  }
  console.log("done", { products, images, seconds: ((Date.now() - t0) / 1000) | 0 });
})();
