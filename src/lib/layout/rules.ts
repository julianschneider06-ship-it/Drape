// Rule-based outfit layout (v3). Pure: pieces + canvas -> rectangles. Numbers live in config.ts (RULES, SIZE, ...).
//  stacked: top above bottom, same vertical axis (left of the canvas centre), hem width = waist width, small gap; shoes on the canvas centre axis
//           overlapping the trouser hem, on top. folded: top upper-left, bottom upper-right, equal height; shoes lower middle.
//  full_body: the item on the left axis, shoes on the centre axis overlapping its hem.
import { DEFAULT_ASPECT, JITTER, MARGIN_ZONE, RULES, SIZE, SCALE_SHOES, SCALE_TOP_BOTTOM } from "./config";
import type { Layout, LayoutDebug, Placed, PieceIn, Rect, SlotName } from "./engine";

const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function computeRuleLayout(opts: { kind: "three" | "full"; pieces: Partial<Record<SlotName, PieceIn>>; seed: number; canvas: { w: number; h: number } }): Layout {
  const { w: W, h: H } = opts.canvas;
  const P = opts.pieces, R = RULES;
  const padX = R.edgePad * W, padY = R.edgePadY * H;
  const frameRight = W - MARGIN_ZONE * W;                      // the right margin zone stays free
  const axis = R.axisX * W, centre = R.centreX * W;
  const aspect = (p: PieceIn) => (p.aspect && p.aspect > 0.05 ? p.aspect : DEFAULT_ASPECT[p.cls]);
  const sc = (p: PieceIn) => (p.slot === "shoes" ? SCALE_SHOES : SCALE_TOP_BOTTOM);
  const capW = (p: PieceIn) => SIZE[p.cls].maxW * W * sc(p), capH = (p: PieceIn) => SIZE[p.cls].maxH * H * sc(p);
  const binding: string[] = [];
  const dbg: LayoutDebug = { mode: "stacked", axisX: axis, centreX: centre, binding };
  const rects: Partial<Record<SlotName, Rect>> = {};
  const availH = H - 2 * padY;
  let fitF = 1;

  // shoes size (current shoe caps x enlargement)
  const shoe = P.shoes!, sa = aspect(shoe);
  let sw = Math.min(capW(shoe), capH(shoe) * sa), sh = sw / sa;
  const ov = R.shoeOverlap;
  const shoeMaxW = 2 * Math.min(centre - padX, frameRight - padX - centre);   // shoes stay left of the margin zone and inside the canvas
  if (sw > shoeMaxW) { sw = shoeMaxW; sh = sw / sa; binding.push("shoe-width"); }
  const axisMaxW = 2 * Math.min(axis - padX, frameRight - padX - axis);   // widest piece that keeps the axis and both edges

  const full = P.full;
  const top = P.top, bottom = P.bottom;
  const isTopLike = (p: PieceIn) => p.cls === "top" || p.cls === "outer" || p.cls === "longcoat";
  const spread = (p: PieceIn) => R.stackedPresentations.includes(p.presentation ?? "spread_front") && !(isTopLike(p) && (p.fill ?? 0) >= R.foldedFillMin);
  const isShort = (p: PieceIn) => p.cls === "shorts" || p.cls === "skirt" || aspect(p) >= R.shortAspectMin;
  const folded = !full && !!top && !!bottom && (!spread(top) || !spread(bottom));

  if (full) {
    dbg.mode = "full";
    const a = aspect(full);
    let w = Math.min(capW(full), capH(full) * a);
    if (w >= capW(full) - 0.5) binding.push("class-cap-width"); else binding.push("class-cap-height");
    if (w > axisMaxW) { w = axisMaxW; binding.push("axis-width"); }
    let h = w / a;
    // short one-piece (mini dress, wide set): same shoe balance as for short bottoms
    let ovPx = ov * sh;
    if (isShort(full)) {
      if (sh > R.shortShoeMaxH * h) { sh = R.shortShoeMaxH * h; sw = sh * sa; binding.push("short-shoe-cap"); }
      ovPx = Math.min(ov * sh, R.shortMaxCover * h);
    }
    const T = h + sh - ovPx;
    const f = Math.min(1, availH / T);
    if (f < 1) binding.push("height-fit");
    fitF = f;
    w *= f; h *= f; sw *= f; sh *= f; ovPx *= f;
    const y0 = padY + (availH - (h + sh - ovPx)) / 2;
    rects.full = { x: axis - w / 2, y: y0, w, h };
    rects.shoes = { x: centre - sw / 2, y: y0 + h - ovPx, w: sw, h: sh };
  } else if (!folded) {
    const t = top!, b = bottom!, at = aspect(t), ab = aspect(b);
    // seam match: hem_top * w_top = waist_bottom * w_bottom  ->  w_top / w_bottom = waist / hem (equal widths when a measurement is missing)
    const measured = !!t.hem && !!b.waist;
    const want = measured ? b.waist! / t.hem! : 1;
    // allowed width ratio: seam clamp, narrowed by the soft height rule (h_top / h_bottom = r * a_bottom / a_top stays in heightRatioRange)
    let lo = R.ratioClamp[0], hi = R.ratioClamp[1];
    const hLo = (R.heightRatioRange[0] * at) / ab, hHi = (R.heightRatioRange[1] * at) / ab;
    const softMin = hLo > lo && want < hLo, softMax = hHi < hi && want > hHi;   // only reported when the soft rule actually changes the width
    if (hLo > lo) lo = hLo;
    if (hHi < hi) hi = hHi;
    if (softMin) binding.push("soft-height-min");
    if (softMax) binding.push("soft-height-max");
    if (lo > hi) { lo = hi = hLo > R.ratioClamp[1] ? hLo : hHi; }   // rules disagree: the visual size rule wins
    const r = Math.min(hi, Math.max(lo, want));
    dbg.ratio = r; dbg.seamMatched = measured && Math.abs(r - want) < 1e-6;
    // largest bottom width k such that every cap holds: bottom caps, top caps (top width = r * k), axis width
    const lim = { "class-cap-bottom": Math.min(capW(b), capH(b) * ab), "class-cap-top": Math.min(capW(t), capH(t) * at) / r, "axis-width": axisMaxW / Math.max(1, r) };
    const [bk, k0] = Object.entries(lim).sort((x, y) => x[1] - y[1])[0];
    binding.push(bk);
    const k = k0;
    let wt = r * k, wb = k, ht = wt / at, hb = wb / ab;
    const gap = R.seamGap * H;
    // short bottoms (shorts, knee-length skirts, anything wider than tall): shoes at most shortShoeMaxH x the bottom's height and
    // covering at most shortMaxCover of it, so they never swallow the garment
    let ovPx = ov * sh;
    if (isShort(b)) {
      if (sh > R.shortShoeMaxH * hb) { sh = R.shortShoeMaxH * hb; sw = sh * sa; binding.push("short-shoe-cap"); }
      ovPx = Math.min(ov * sh, R.shortMaxCover * hb);
    }
    const T = ht + gap + hb + sh - ovPx;
    const f = Math.min(1, availH / T);
    if (f < 1) binding.push("height-fit");
    fitF = f;
    wt *= f; wb *= f; ht *= f; hb *= f; sw *= f; sh *= f; ovPx *= f;
    const gapPx = gap;
    const y0 = padY + (availH - (ht + gapPx + hb + sh - ovPx)) / 2;
    rects.top = { x: axis - wt / 2, y: y0, w: wt, h: ht };
    rects.bottom = { x: axis - wb / 2, y: y0 + ht + gapPx, w: wb, h: hb };
    rects.shoes = { x: centre - sw / 2, y: rects.bottom.y + hb - ovPx, w: sw, h: sh };
    if (t.hem) dbg.hemLine = { y: rects.top.y + ht, x0: axis - (t.hem * wt) / 2, x1: axis + (t.hem * wt) / 2 };
    if (b.waist) dbg.waistLine = { y: rects.bottom.y, x0: axis - (b.waist * wb) / 2, x1: axis + (b.waist * wb) / 2 };
  } else {
    dbg.mode = "folded";
    const t = top!, b = bottom!, at = aspect(t), ab = aspect(b);
    const gapX = R.foldedGap * W;
    const usableW = frameRight - 2 * padX;
    const upperH = R.foldedTopHalfH * H - padY;
    // EQUAL VISUAL AREA A: width = sqrt(A * aspect), height = sqrt(A / aspect). sqrt(A) is the largest value for which
    // each piece stays under foldedMaxW, both fit side by side left of the margin zone, and the taller one fits the upper part
    const lim = {
      "piece-max-width": Math.min((R.foldedMaxW * W) / Math.sqrt(at), (R.foldedMaxW * W) / Math.sqrt(ab)),
      "pair-width": (usableW - gapX) / (Math.sqrt(at) + Math.sqrt(ab)),
      "upper-height": upperH / Math.max(1 / Math.sqrt(at), 1 / Math.sqrt(ab)),
    };
    const [fk, q] = Object.entries(lim).sort((x, y) => x[1] - y[1])[0];
    binding.push(fk);
    const wt = q * Math.sqrt(at), ht = q / Math.sqrt(at), wb = q * Math.sqrt(ab), hb = q / Math.sqrt(ab);
    const cy = padY + upperH / 2;
    rects.top = { x: padX, y: cy - ht / 2, w: wt, h: ht };
    rects.bottom = { x: frameRight - padX - wb, y: cy - hb / 2, w: wb, h: hb };
    // shoes: centred on the centre axis, lower half (no overlap needed), at most foldedShoeMaxH x the pair's height
    const pairH = Math.max(ht, hb);
    if (sh > pairH * R.foldedShoeMaxH) { sh = pairH * R.foldedShoeMaxH; sw = sh * sa; binding.push("folded-shoe-cap"); }
    rects.shoes = { x: centre - sw / 2, y: R.foldedShoesCy * H - sh / 2, w: sw, h: sh };
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
  return { fit: fitF, template: dbg.mode === "folded" ? "R-folded" : dbg.mode === "full" ? "R-full" : "R-stacked", margin: "right", pieces: placed, frame,
    marginRect: { x: frameRight, y: 0, w: W - frameRight, h: H }, canvas: opts.canvas, debug: dbg };
}
