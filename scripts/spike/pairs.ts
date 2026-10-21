// Finds sale products whose cutout shows two separate shapes (pairs) and the outfits (pool-like) to see them. Prints product ids.
import sharp from "sharp";
import { loadCat } from "./lib";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const out: { id: number; gap: number; comps: number; sale: boolean }[] = [];
  const shoes = cat.pieces.filter((p) => p.slot === "shoes" && (p.card as { cutout?: string } | undefined)?.cutout);
  let i = 0;
  await Promise.all(Array.from({ length: 12 }, async () => { while (i < shoes.length) { const p = shoes[i++]; const card = p.card as { cutout: string; compare_at_cents?: number; price_cents?: number };
    try { const r = await fetch(card.cutout); const { data, info } = await sharp(Buffer.from(await r.arrayBuffer())).resize(72).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height, on = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) on[k] = data[k * 4 + 3] > 40 ? 1 : 0;
      const lab = new Int16Array(W * H), sizes: number[] = [], px: number[][] = []; const st: number[] = [];
      for (let s = 0; s < W * H; s++) { if (!on[s] || lab[s]) continue; const id = sizes.length + 1; sizes.push(0); px.push([]); lab[s] = id; st.push(s);
        while (st.length) { const q = st.pop()!, x = q % W, y = (q / W) | 0; sizes[id - 1]++; let e = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || !on[ny * W + nx]) { e = true; continue; } const j = ny * W + nx; if (!lab[j]) { lab[j] = id; st.push(j); } } if (e) px[id - 1].push(q); } }
      const mx = Math.max(...sizes), big = sizes.map((n, k) => [n, k] as const).filter(([n]) => n >= 0.15 * mx).sort((a, b) => b[0] - a[0]);
      if (big.length >= 2) { let best = Infinity; for (const a of px[big[0][1]]) for (const b of px[big[1][1]]) { const dx = (a % W) - (b % W), dy = ((a / W) | 0) - ((b / W) | 0); best = Math.min(best, dx * dx + dy * dy); } out.push({ id: p.id, gap: Math.sqrt(best) / W, comps: big.length, sale: !!card.compare_at_cents && card.compare_at_cents > (card.price_cents ?? 0) }); }
    } catch { /* skip */ } } }));
  console.log(`shoes ${shoes.length}, with 2+ separate shapes ${out.length}, on sale ${out.filter((o) => o.sale).length}`);
  console.log(JSON.stringify(out.filter((o) => o.sale).sort((a, b) => b.gap - a.gap).slice(0, 12)));
})();
