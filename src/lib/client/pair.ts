"use client";
// A product photo can show a PAIR (shoes: two separate shapes in one cutout). For the sale outline the pair counts as ONE object: this finds out whether the
// cutout has two (or more) separate shapes and how far apart they are (as a share of the image width), so the outline can be drawn around the union.
const cache = new Map<string, Promise<number | null>>();
const W = 72;

export function pairGap(src: string): Promise<number | null> {
  let p = cache.get(src);
  if (!p) { p = analyse(src).catch(() => null); cache.set(src, p); }
  return p;
}

async function analyse(src: string): Promise<number | null> {
  const img = new Image(); img.crossOrigin = "anonymous"; img.src = src; await img.decode();
  const h = Math.max(8, Math.round((W * img.naturalHeight) / img.naturalWidth)), c = document.createElement("canvas"); c.width = W; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, W, h);
  const d = ctx.getImageData(0, 0, W, h).data, on = new Uint8Array(W * h); for (let i = 0; i < W * h; i++) on[i] = d[i * 4 + 3] > 40 ? 1 : 0;
  // connected components (8-neighbourhood)
  const lab = new Int16Array(W * h), comps: { n: number; px: number[] }[] = []; const stack: number[] = [];
  for (let s = 0; s < W * h; s++) {
    if (!on[s] || lab[s]) continue;
    const id = comps.length + 1, comp = { n: 0, px: [] as number[] }; comps.push(comp); lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0; comp.n++;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= h || !on[ny * W + nx]) { edge = true; continue; }
        const j = ny * W + nx; if (!lab[j]) { lab[j] = id; stack.push(j); }
      }
      if (edge) comp.px.push(i);
    }
  }
  const big = comps.filter((x) => x.n >= 0.15 * Math.max(...comps.map((y) => y.n))).sort((a, b) => b.n - a.n);   // tiny specks and fringe do not count as a second object
  if (big.length < 2) return null;
  // smallest distance between the two largest shapes (edge pixels), as a share of the image width
  let best = Infinity;
  for (const a of big[0].px) { const ax = a % W, ay = (a / W) | 0; for (const b of big[1].px) { const dx = ax - (b % W), dy = ay - ((b / W) | 0), dd = dx * dx + dy * dy; if (dd < best) best = dd; } }
  return Math.sqrt(best) / W;
}
