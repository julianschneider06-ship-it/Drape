// Rule-based outfit layout (v3). Pure: pieces + canvas -> rectangles. Numbers live in config.ts (RULES, SIZE, ...).
//  stacked: top above bottom, same vertical axis (left of the canvas centre), hem width = waist width, small gap; shoes on the canvas centre axis
//           overlapping the trouser hem, on top. folded: top upper-left, bottom upper-right, equal height; shoes lower middle.
//  full_body: the item on the left axis, shoes on the centre axis overlapping its hem.
import { DEFAULT_ASPECT, JITTER, MARGIN_ZONE, PIECE_SCALE, RULES, SIZE } from "./config";
import type { Layout, LayoutDebug, Placed, PieceIn, Rect, SlotName } from "./engine";

const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function computeRuleLayout(opts: { kind: "three" | "full"; pieces: Partial<Record<SlotName, PieceIn>>; seed: number; canvas: { w: number; h: number } }): Layout {
  const { w: W, h: H } = opts.canvas;
  const P = opts.pieces, R = RULES, S = PIECE_SCALE;
  const padX = R.edgePad * W, padY = R.edgePad * H;
  const frameRight = W - MARGIN_ZONE * W;                      // the right margin zone stays free
  const axis = R.axisX * W, centre = R.centreX * W;
  const aspect = (p: PieceIn) => (p.aspect && p.aspect > 0.05 ? p.aspect : DEFAULT_ASPECT[p.cls]);
  const capW = (p: PieceIn) => SIZE[p.cls].maxW * W * S, capH = (p: PieceIn) => SIZE[p.cls].maxH * H * S;
  const binding: string[] = [];
  const dbg: LayoutDebug = { mode: "stacked", axisX: axis, centreX: centre, binding };
  const rects: Partial<Record<SlotName, Rect>> = {};
  const availH = H - 2 * padY;

  // shoes size (current shoe caps x enlargement)
  const shoe = P.shoes!, sa = aspect(shoe);
  let sw = Math.min(capW(shoe), capH(shoe) * sa), sh = sw / sa;
  const ov = R.shoeOverlap;
  const axisMaxW = 2 * Math.min(axis - padX, frameRight - padX - axis);   // widest piece that keeps the axis and both edges

  const full = P.full;
  const top = P.top, bottom = P.bottom;
  const folded = !full && !!top && !!bottom && (!R.stackedPresentations.includes(top.presentation ?? "spread_front") || !R.stackedPresentations.includes(bottom.presentation ?? "spread_front"));

  if (full) {
    dbg.mode = "full";
    const a = aspect(full);
    let w = Math.min(capW(full), capH(full) * a);
    if (w >= capW(full) - 0.5) binding.push("class-cap-width"); else binding.push("class-cap-height");
    if (w > axisMaxW) { w = axisMaxW; binding.push("axis-width"); }
    let h = w / a;
    const T = h + sh * (1 - ov);
    const f = Math.min(1, availH / T);
    if (f < 1) binding.push("height-fit");
    w *= f; h *= f; sw *= f; sh *= f;
    const y0 = padY + (availH - (h + sh * (1 - ov))) / 2;
    rects.full = { x: axis - w / 2, y: y0, w, h };
    rects.shoes = { x: centre - sw / 2, y: y0 + h - ov * sh, w: sw, h: sh };
  } else if (!folded) {
    const t = top!, b = bottom!, at = aspect(t), ab = aspect(b);
    // seam match: hem_top * w_top = waist_bottom * w_bottom  ->  w_top / w_bottom = waist / hem (equal widths when a measurement is missing)
    const measured = !!t.hem && !!b.waist;
    const want = measured ? b.waist! / t.hem! : 1;
    const r = Math.min(R.ratioClamp[1], Math.max(R.ratioClamp[0], want));
    dbg.ratio = r; dbg.seamMatched = measured && Math.abs(r - want) < 1e-6;
    // largest bottom width k such that every cap holds: bottom caps, top caps (top width = r * k), axis width
    const lim = { "class-cap-bottom": Math.min(capW(b), capH(b) * ab), "class-cap-top": Math.min(capW(t), capH(t) * at) / r, "axis-width": axisMaxW / Math.max(1, r) };
    const [bk, k0] = Object.entries(lim).sort((x, y) => x[1] - y[1])[0];
    binding.push(bk);
    const k = k0;
    let wt = r * k, wb = k, ht = wt / at, hb = wb / ab;
    const gap = R.seamGap * H;
    const T = ht + gap + hb + sh * (1 - ov);
    const f = Math.min(1, availH / T);
    if (f < 1) binding.push("height-fit");
    wt *= f; wb *= f; ht *= f; hb *= f; sw *= f; sh *= f;
    const gapPx = gap;
    const y0 = padY + (availH - (ht + gapPx + hb + sh * (1 - ov))) / 2;
    rects.top = { x: axis - wt / 2, y: y0, w: wt, h: ht };
    rects.bottom = { x: axis - wb / 2, y: y0 + ht + gapPx, w: wb, h: hb };
    rects.shoes = { x: centre - sw / 2, y: rects.bottom.y + hb - ov * sh, w: sw, h: sh };
    if (t.hem) dbg.hemLine = { y: rects.top.y + ht, x0: axis - (t.hem * wt) / 2, x1: axis + (t.hem * wt) / 2 };
    if (b.waist) dbg.waistLine = { y: rects.bottom.y, x0: axis - (b.waist * wb) / 2, x1: axis + (b.waist * wb) / 2 };
  } else {
    dbg.mode = "folded";
    const t = top!, b = bottom!, at = aspect(t), ab = aspect(b);
    const gapX = R.foldedGap * W;
    const usableW = frameRight - 2 * padX;
    const halfW = (usableW - gapX) / 2;
    const upperH = R.foldedTopHalfH * H - padY;
    // equal heights; each piece must fit its half in width and the upper area in height
    const hMax = Math.min(halfW / at, halfW / ab, upperH);
    binding.push(hMax === upperH ? "upper-height" : "half-width");
    const h = hMax, wt = h * at, wb = h * ab;
    const cy = padY + upperH / 2;
    rects.top = { x: padX, y: cy - h / 2, w: wt, h };
    rects.bottom = { x: frameRight - padX - wb, y: cy - h / 2, w: wb, h };
    // shoes: normal size, centred on the centre axis, lower half (no overlap needed)
    const f = 1;
    rects.shoes = { x: centre - sw * f / 2, y: R.foldedShoesCy * H - sh / 2, w: sw, h: sh };
  }

  // optional randomness (off by default): whole composition shift + shoe tilt
  let rotShoe = 0;
  if (R.random) {
    const rnd = mulberry32(opts.seed ^ 0x9e3779b9), sym = (m: number) => (rnd() * 2 - 1) * m;
    const dx = sym(JITTER.clusterX) * W, dy = sym(JITTER.clusterY) * H;
    for (const r of Object.values(rects)) { r!.x += dx; r!.y += dy; }
    rotShoe = sym(JITTER.shoeRotDeg);
  }

  const z = { top: 2, bottom: 1, shoes: 3, full: 1 };
  const placed: Placed[] = (Object.entries(rects) as [SlotName, Rect][]).map(([slot, rect]) => ({ slot, rect, rot: slot === "shoes" ? rotShoe : 0, z: z[slot] }));
  placed.sort((a, b) => a.z - b.z);
  const frame: Rect = { x: 0, y: padY, w: frameRight, h: availH };
  return { fit: 1, template: dbg.mode === "folded" ? "R-folded" : dbg.mode === "full" ? "R-full" : "R-stacked", margin: "right", pieces: placed, frame,
    marginRect: { x: frameRight, y: 0, w: W - frameRight, h: H }, canvas: opts.canvas, debug: dbg };
}
