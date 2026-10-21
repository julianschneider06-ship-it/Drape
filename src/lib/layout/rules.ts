// Rule-based outfit layout (v3). Pure: pieces + accessories + canvas -> rectangles. Numbers live in config.ts (RULES, ACCESSORIES, SIZE, ...).
//  stacked: top above bottom, same vertical axis (left of the canvas centre), hem width = waist width, small gap; shoes on the canvas centre axis
//           overlapping the trouser hem, on top. folded: top upper-left, bottom upper-right, equal visual area; shoes lower middle.
//  full_body: the item on the left axis, shoes on the centre axis overlapping its hem.
//  accessories: head zone above the top (hat, inline glasses), inline overlays (necklace, belt at the seam), watch/bracelet beside the sleeve,
//           everything else in a side column on the right (vertical zones, collisions resolved, shrink then drop the lowest priority).
import { ACCESSORIES as A, DEFAULT_ASPECT, JITTER, MARGIN_ZONE, REAL_CM, REF_CM, RULES, SIZE, SCALE_SHOES, SCALE_TOP_BOTTOM } from "./config";
import type { AccIn, Layout, LayoutDebug, Placed, PieceIn, Rect, SlotName } from "./engine";

const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const HEAD_TYPES = new Set(["cap", "hat", "beanie"]);

interface Main { rects: Partial<Record<SlotName, Rect>>; fit: number; binding: string[]; ratio?: number; seamMatched?: boolean;
  hemLine?: LayoutDebug["hemLine"]; waistLine?: LayoutDebug["waistLine"]; seam?: { y: number; w: number } }

export function computeRuleLayout(opts: { kind: "three" | "full"; pieces: Partial<Record<SlotName, PieceIn>>; seed: number; canvas: { w: number; h: number }; accessories?: AccIn[] }): Layout {
  const { w: W, h: H } = opts.canvas;
  const P = opts.pieces, R = RULES;
  const padX = R.edgePad * W, padY = R.edgePadY * H, padTop = R.edgePadTop * H;
  const frameRight = W - MARGIN_ZONE * W;                      // the right margin zone stays free of main pieces
  const axis = R.axisX * W, centre = R.centreX * W;
  const aspect = (p: PieceIn) => (p.aspect && p.aspect > 0.05 ? p.aspect : DEFAULT_ASPECT[p.cls]);
  const sc = (p: PieceIn) => (p.slot === "shoes" ? SCALE_SHOES : SCALE_TOP_BOTTOM);
  const capW = (p: PieceIn) => SIZE[p.cls].maxW * W * sc(p), capH = (p: PieceIn) => SIZE[p.cls].maxH * H * sc(p);
  const availH = H - padTop - padY;
  const shoe = P.shoes!, sa = aspect(shoe);
  const ov = R.shoeOverlap;
  const shoeMaxW = 2 * Math.min(centre - padX, frameRight - padX - centre);   // shoes stay left of the margin zone and inside the canvas
  const axisMaxW = 2 * Math.min(axis - padX, frameRight - padX - axis);        // widest piece that keeps the axis and both edges
  const full = P.full, top = P.top, bottom = P.bottom;
  const isTopLike = (p: PieceIn) => p.cls === "top" || p.cls === "outer" || p.cls === "longcoat";
  const spread = (p: PieceIn) => R.stackedPresentations.includes(p.presentation ?? "spread_front") && !(isTopLike(p) && (p.fill ?? 0) >= R.foldedFillMin);
  const isShort = (p: PieceIn) => p.cls === "shorts" || p.cls === "skirt" || aspect(p) >= R.shortAspectMin;
  const folded = !full && !!top && !!bottom && (!spread(top) || !spread(bottom));

  const baseShoe = () => {
    const binding: string[] = [];
    let sw = Math.min(capW(shoe), capH(shoe) * sa), sh = sw / sa;
    if (sw > shoeMaxW) { sw = shoeMaxW; sh = sw / sa; binding.push("shoe-width"); }
    return { sw, sh, binding };
  };

  // ---- main stack (stacked / full), with `reserve` px of canvas height kept free above it for the head zone ----
  const layMain = (reserve: number): Main => {
    let { sw, sh, binding } = baseShoe();
    const rects: Main["rects"] = {};
    const aH = availH - reserve;
    if (full) {
      const a = aspect(full);
      let w = Math.min(capW(full), capH(full) * a);
      binding.push(w >= capW(full) - 0.5 ? "class-cap-width" : "class-cap-height");
      if (w > axisMaxW) { w = axisMaxW; binding.push("axis-width"); }
      let h = w / a;
      let ovPx = ov * sh;
      if (isShort(full)) {
        if (sh > R.shortShoeMaxH * h) { sh = R.shortShoeMaxH * h; sw = sh * sa; binding.push("short-shoe-cap"); }
        ovPx = Math.min(ov * sh, R.shortMaxCover * h);
      }
      const T = h + sh - ovPx;
      const f = Math.min(1, aH / T);
      if (f < 1) binding.push("height-fit");
      w *= f; h *= f; sw *= f; sh *= f; ovPx *= f;
      const y0 = padTop + reserve + (aH - (h + sh - ovPx)) * R.stackSlackShare;
      rects.full = { x: axis - w / 2, y: y0, w, h };
      rects.shoes = { x: centre - sw / 2, y: y0 + h - ovPx, w: sw, h: sh };
      return { rects, fit: f, binding };
    }
    const t = top!, b = bottom!, at = aspect(t), ab = aspect(b);
    // seam match: hem_top * w_top = waist_bottom * w_bottom  ->  w_top / w_bottom = waist / hem (equal widths when a measurement is missing)
    const measured = !!t.hem && !!b.waist;
    const want = measured ? b.waist! / t.hem! : 1;
    // allowed width ratio: seam clamp, narrowed by the soft height rule (h_top / h_bottom = r * a_bottom / a_top stays in heightRatioRange)
    let lo = R.ratioClamp[0], hi = R.ratioClamp[1];
    const hLo = (R.heightRatioRange[0] * at) / ab, hHi = (R.heightRatioRange[1] * at) / ab;
    const softMin = hLo > lo && want < hLo, softMax = hHi < hi && want > hHi;
    if (hLo > lo) lo = hLo;
    if (hHi < hi) hi = hHi;
    if (softMin) binding.push("soft-height-min");
    if (softMax) binding.push("soft-height-max");
    if (lo > hi) { lo = hi = hLo > R.ratioClamp[1] ? hLo : hHi; }   // rules disagree: the visual size rule wins
    const r = Math.min(hi, Math.max(lo, want));
    // largest bottom width k such that every cap holds: bottom caps, top caps (top width = r * k), axis width
    const lim = { "class-cap-bottom": Math.min(capW(b), capH(b) * ab), "class-cap-top": Math.min(capW(t), capH(t) * at) / r, "axis-width": axisMaxW / Math.max(1, r) };
    const [bk, k] = Object.entries(lim).sort((x, y) => x[1] - y[1])[0];
    binding.push(bk);
    let wt = r * k, wb = k, ht = wt / at, hb = wb / ab;
    const gap = R.seamGap * H;
    // short bottoms: shoes at most shortShoeMaxH x the bottom's height and covering at most shortMaxCover of it
    let ovPx = ov * sh;
    if (isShort(b)) {
      if (sh > R.shortShoeMaxH * hb) { sh = R.shortShoeMaxH * hb; sw = sh * sa; binding.push("short-shoe-cap"); }
      ovPx = Math.min(ov * sh, R.shortMaxCover * hb);
    }
    const T = ht + gap + hb + sh - ovPx;
    const f = Math.min(1, aH / T);
    if (f < 1) binding.push("height-fit");
    wt *= f; wb *= f; ht *= f; hb *= f; sw *= f; sh *= f; ovPx *= f;
    const gapPx = gap * f;
    const y0 = padTop + reserve + (aH - (ht + gapPx + hb + sh - ovPx)) * R.stackSlackShare;
    rects.top = { x: axis - wt / 2, y: y0, w: wt, h: ht };
    rects.bottom = { x: axis - wb / 2, y: y0 + ht + gapPx, w: wb, h: hb };
    rects.shoes = { x: centre - sw / 2, y: rects.bottom.y + hb - ovPx, w: sw, h: sh };
    const out: Main = { rects, fit: f, binding, ratio: r, seamMatched: measured && Math.abs(r - want) < 1e-6 };
    if (t.hem) out.hemLine = { y: rects.top.y + ht, x0: axis - (t.hem * wt) / 2, x1: axis + (t.hem * wt) / 2 };
    if (b.waist) out.waistLine = { y: rects.bottom.y, x0: axis - (b.waist * wb) / 2, x1: axis + (b.waist * wb) / 2 };
    out.seam = { y: rects.top.y + ht + gapPx / 2, w: (b.waist ? b.waist * wb : Math.min(wt, wb) * 0.9) };
    return out;
  };

  const dbg: LayoutDebug = { mode: "stacked", axisX: axis, centreX: centre, binding: [] };
  let rects: Partial<Record<SlotName, Rect>> = {};
  let fitF = 1;
  const placedExtra: Placed[] = [];
  // sunglasses always go to the side column (no head zone, no inline)
  const accs = (A.enabled ? (opts.accessories ?? []) : []).map((a): AccIn => (a.type === "sunglasses" ? { ...a, placement: "side", zone: "upper" } : a));
  const accInfo = { headZone: false, headShrink: 0, placed: [] as { slot: string; type: string; kind: string; zone: string }[], demoted: [] as string[], dropped: [] as string[], shrunkTo: 1, limited: [] as string[] };

  if (!folded) {
    dbg.mode = full ? "full" : "stacked";
    let m = layMain(0);
    // ---- head zone: hat above the top, as wide as the collar x ~1.15; only if the main stack does not shrink by more than headMaxShrink ----
    const hat = accs.find((a) => a.placement === "head" && HEAD_TYPES.has(a.type));
    const taken = new Set<string>();
    const hooded = !!(full ?? top)?.hood;   // never a head item above a hood: it goes to the side column
    if (hat && hooded) accInfo.demoted.push(`${hat.type}:hooded-top`);
    if (hat && !hooded) {
      const mainPc = (full ?? top)!;
      // the hat's size depends on the top's width, which depends on the reserve: iterate (reserve -> stack -> size -> reserve)
      let reserve = 0, m1 = m, hs = headSize(hat, (m1.rects.top ?? m1.rects.full)!.w, mainPc.collar, W, H);
      for (let it = 0; it < 3; it++) {
        hs = headSize(hat, (m1.rects.top ?? m1.rects.full)!.w, mainPc.collar, W, H);
        reserve = hs.h * (1 - A.head.overlap);
        m1 = layMain(reserve);
      }
      const shrink = 1 - m1.fit / Math.max(1e-9, m.fit);
      if (shrink <= A.headMaxShrink) {
        accInfo.headZone = true; accInfo.headShrink = shrink; m = m1;
        const t0 = (m.rects.top ?? m.rects.full)!;
        const rect = { x: axis - hs.w / 2, y: t0.y - hs.h * (1 - A.head.overlap), w: hs.w, h: hs.h };
        placedExtra.push({ slot: hat.slot, rect, rot: 0, z: A.z.inline }); taken.add(hat.slot);
        accInfo.placed.push({ slot: hat.slot, type: hat.type, kind: "head", zone: "head" });
      } else accInfo.demoted.push(`${hat.type}:head-zone-too-costly(${(shrink * 100).toFixed(0)}%)`);
    }
    rects = m.rects; fitF = m.fit; dbg.binding = m.binding; dbg.ratio = m.ratio; dbg.seamMatched = m.seamMatched; dbg.hemLine = m.hemLine; dbg.waistLine = m.waistLine;

    // ---- inline overlays: necklace on the top (front_flat), belt across the seam (straight strip, front_flat, stacked only) ----
    const topRect = (rects.top ?? rects.full)!;
    const ppc = topRect.w / (full ? REF_CM.fullW : REF_CM.topW);   // pixels per cm: accessories use the same scale as the top
    for (const a of accs) {
      if (taken.has(a.slot) || a.placement !== "inline") continue;
      const ar = a.aspect && a.aspect > 0.05 ? a.aspect : 1;
      if (a.zone === "neck" && a.frontFlat && !full) {   // no necklace overlay on dresses / full-body pieces (it goes to the side column)
        let w = A.necklace.widthOfTop * topRect.w, h = w / ar;
        const hMax = A.necklace.maxHOfTop * topRect.h;
        if (h > hMax) { h = hMax; w = h * ar; }
        const rect = { x: axis - w / 2, y: topRect.y + A.necklace.neckline * topRect.h, w, h };
        placedExtra.push({ slot: a.slot, rect, rot: 0, z: A.z.inline }); taken.add(a.slot);
        accInfo.placed.push({ slot: a.slot, type: a.type, kind: "inline", zone: "neck" });
      } else if (a.zone === "seam" && a.frontFlat && a.beltShape === "straight_strip" && m.seam && !full) {
        let w = A.belt.widthOfSeam * m.seam.w, h = w / ar;
        const hMax = A.belt.maxH * H;
        if (h > hMax) { h = hMax; }                        // keeps the strip thin: no extra height
        const rect = { x: axis - w / 2, y: m.seam.y - h / 2, w, h };
        placedExtra.push({ slot: a.slot, rect, rot: 0, z: A.z.inline }); taken.add(a.slot);
        accInfo.placed.push({ slot: a.slot, type: a.type, kind: "inline", zone: "seam" });
      }
    }
    // ---- watch / bracelet right of the top at sleeve height, no overlap with the top ----
    for (const a of accs) {
      if (taken.has(a.slot) || a.placement !== "side" || a.zone !== "sleeve") continue;
      const ar = a.aspect && a.aspect > 0.05 ? a.aspect : 1;
      const sz = sideSize(a, ppc, topRect.h, W, H, ar);
      const x = topRect.x + topRect.w + A.sleeve.gap * W;
      const w = Math.min(sz.w, A.sleeve.maxW * W);
      const h = w / ar;
      const rect = { x, y: topRect.y + A.sleeve.at * topRect.h - h / 2, w, h };
      if (rect.x + rect.w <= W - padX && !collides(rect, [...Object.values(rects), ...placedExtra.map((p) => p.rect)], 2)) {
        placedExtra.push({ slot: a.slot, rect, rot: 0, z: A.z.side }); taken.add(a.slot);
        accInfo.placed.push({ slot: a.slot, type: a.type, kind: "side", zone: "sleeve" });
      } else accInfo.demoted.push(`${a.type}:sleeve->column`);
    }
    // ---- side column for everything else ----
    const rest = accs.filter((a) => !taken.has(a.slot));
    placeSide(rest, rects, placedExtra, accInfo, { W, H, padX, padY, ppc, topRect, bottomRect: rects.bottom, aspectOf: (a) => (a.aspect && a.aspect > 0.05 ? a.aspect : 1) });
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
    dbg.binding.push(fk);
    const wt = q * Math.sqrt(at), ht = q / Math.sqrt(at), wb = q * Math.sqrt(ab), hb = q / Math.sqrt(ab);
    const cy = padY + upperH / 2;
    rects.top = { x: padX, y: cy - ht / 2, w: wt, h: ht };
    rects.bottom = { x: frameRight - padX - wb, y: cy - hb / 2, w: wb, h: hb };
    // shoes: centred on the centre axis, lower half (no overlap needed), at most foldedShoeMaxH x the pair's height
    let { sw, sh } = baseShoe();
    const pairH = Math.max(ht, hb);
    if (sh > pairH * R.foldedShoeMaxH) { sh = pairH * R.foldedShoeMaxH; sw = sh * sa; dbg.binding.push("folded-shoe-cap"); }
    rects.shoes = { x: centre - sw / 2, y: R.foldedShoesCy * H - sh / 2, w: sw, h: sh };
    // folded outfits: every accessory goes to the side column (no head zone, no overlays)
    for (const a of accs) if (a.placement !== "side") accInfo.demoted.push(`${a.type}:${a.placement}->column(folded)`);
    placeSide(accs, rects, placedExtra, accInfo, { W, H, padX, padY, ppc: rects.top.w / REF_CM.topW, topRect: rects.top, bottomRect: rects.bottom, aspectOf: (a) => (a.aspect && a.aspect > 0.05 ? a.aspect : 1) });
  }
  if (accs.length) dbg.acc = accInfo;

  // optional randomness (off by default): whole composition shift + shoe tilt
  let rotShoe = 0;
  if (R.random) {
    const rnd = mulberry32(opts.seed ^ 0x9e3779b9), sym = (m: number) => (rnd() * 2 - 1) * m;
    const dx = sym(JITTER.clusterX) * W, dy = sym(JITTER.clusterY) * H;
    for (const r of Object.values(rects)) { r!.x += dx; r!.y += dy; }
    rotShoe = sym(JITTER.shoeRotDeg);
  }

  const z: Record<string, number> = { top: 2, bottom: 1, shoes: 3, full: 1 };
  const placed: Placed[] = (Object.entries(rects) as [SlotName, Rect][]).map(([slot, rect]) => ({ slot, rect, rot: slot === "shoes" ? rotShoe : 0, z: z[slot] ?? 2 }));
  placed.push(...placedExtra);
  placed.sort((a, b) => a.z - b.z);
  const frame: Rect = { x: 0, y: padTop, w: frameRight, h: availH };
  return { fit: fitF, template: dbg.mode === "folded" ? "R-folded" : dbg.mode === "full" ? "R-full" : "R-stacked", margin: "right", pieces: placed, frame,
    marginRect: { x: frameRight, y: 0, w: W - frameRight, h: H }, canvas: opts.canvas, debug: dbg };
}

// ---------------------------------------------------------------------------------------------------------------------------------

/** Head item: as wide as the collar x collarMul (1.0-1.3), at most maxH tall; without a collar measurement at most fallbackWidthOfTop x the top's width. */
function headSize(a: AccIn, topW: number, collar: number | null | undefined, W: number, H: number) {
  const ar = a.aspect && a.aspect > 0.05 ? a.aspect : 1.4;
  const mul = Math.min(A.head.mulRange[1], Math.max(A.head.mulRange[0], A.head.collarMul));
  let w = collar ? collar * topW * mul : A.head.fallbackWidthOfTop * topW;
  if (a.type === "cap") w *= A.boost.cap;   // the bill makes caps look small: the visible crown needs ~20% more
  let h = w / ar;
  if (w < A.head.minW * W) { w = A.head.minW * W; h = w / ar; }   // narrow necks (halter, straps) must not make the hat tiny
  if (h > A.head.maxH * H) { h = A.head.maxH * H; w = h * ar; }
  return { w: Math.min(w, 0.6 * W), h };
}
/** Real-world size -> pixels with the top's pixels-per-cm. Longest side = REAL_CM; straight ties are drawn about as long as the top is tall; minimum visible size per type. */
function sideSize(a: AccIn, ppc: number, topH: number, W: number, H: number, ar: number) {
  const row = REAL_CM[a.type] ?? REAL_CM.other_wearable;
  const sc = (a.size === "small" || a.size === "large" ? a.size : "medium") as "small" | "medium" | "large";
  let cm = row[sc];
  let L = 0;
  if (a.type === "tie" && (ar <= 1 / A.tieAspectStraight)) L = Math.min(A.tieStraightCm * ppc, A.tieMaxOfTopH * topH);   // tall, thin = straight tie
  else if (a.type === "belt" && a.beltShape !== "straight_strip") cm = A.beltCoiledCm;
  if (!L) L = cm * ppc;
  L *= A.boost[a.type] ?? A.boost.default;
  L = Math.max(L, (A.minLongest[a.type] ?? A.minLongest.default) * W);
  let w = ar >= 1 ? L : L * ar, h = ar >= 1 ? L / ar : L;
  const maxW = A.side.maxColW * W;
  if (w > maxW) { h *= maxW / w; w = maxW; }
  if (h > 0.5 * H) { w *= 0.5 * H / h; h = 0.5 * H; }
  return { w, h };
}
const overlapsRect = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const collides = (r: Rect, others: Rect[], pad = 0) => others.some((o) => overlapsRect(r, o, pad));

/** Side column: items sit right-aligned at the canvas edge in vertical zones; collisions are resolved by moving up/down;
 *  if something does not fit, all side items shrink (down to minScale), then the lowest-priority item is dropped. Main pieces are never touched. */
function placeSide(items: AccIn[], main: Partial<Record<SlotName, Rect>>, out: Placed[], info: { placed: { slot: string; type: string; kind: string; zone: string }[]; dropped: string[]; shrunkTo: number; limited: string[] },
  c: { W: number; H: number; padX: number; padY: number; ppc: number; topRect?: Rect; bottomRect?: Rect; aspectOf: (a: AccIn) => number }) {
  if (!items.length) return;
  const fixed = [...Object.values(main), ...out.map((p) => p.rect)] as Rect[];
  const zoneCy = (a: AccIn) => {
    if (a.zone === "hip" && c.bottomRect) return c.bottomRect.y + 0.18 * c.bottomRect.h;
    if (a.zone === "upper" && c.topRect) return c.topRect.y + 0.2 * c.topRect.h;
    if (a.zone === "mid" && c.topRect && c.bottomRect) return c.topRect.y + c.topRect.h;
    return (A.side.zoneY[a.zone] ?? A.side.zoneY.mid) * c.H;
  };
  const gap = A.side.gapX * c.W;
  const fitted = new Set<string>();   // types that had to be shrunk to the free column width
  const tryPlace = (list: AccIn[], scale: number) => {
    const placedHere: { slot: string; rect: Rect; a: AccIn }[] = [];
    fitted.clear();
    const order = [...list].sort((x, y) => (A.side.priority[y.type] ?? 1) - (A.side.priority[x.type] ?? 1));
    for (const a of order) {
      const sz = sideSize(a, c.ppc, c.topRect?.h ?? 0.4 * c.H, c.W, c.H, c.aspectOf(a));
      const w = sz.w * scale, h = sz.h * scale;
      const cy0 = zoneCy(a);
      let ok: Rect | null = null;
      // candidate vertical positions: the zone centre, then alternately up and down in steps of 40% of the item's height
      for (let k = 0; k < 40 && !ok; k++) {
        const off = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4 * h;
        const y = cy0 + off - h / 2;
        if (y < c.padY || y + h > c.H - c.padY) continue;
        // free x range at this height: right of everything that overlaps the band, left of the screen edge margin
        let left = c.padX;
        const band: Rect = { x: 0, y: y - 2, w: c.W, h: h + 4 };
        for (const r of [...fixed, ...placedHere.map((p) => p.rect)]) if (r.y < band.y + band.h && r.y + r.h > band.y) left = Math.max(left, r.x + r.w + gap);
        const x = c.W - c.padX - w;
        if (x >= left) ok = { x, y, w, h };
        else {
          // not enough free width at this height: shrink the item to the free width if that is still big enough (>= minScale of its size and its minimum visible size)
          const fw = c.W - c.padX - left, f = fw / w;
          const minL = (A.minLongest[a.type] ?? A.minLongest.default) * c.W;
          if (f >= A.side.minScale && Math.max(fw, h * f) >= minL) { ok = { x: left, y: y + (h - h * f) / 2, w: fw, h: h * f }; fitted.add(a.type); }
        }
      }
      if (!ok) return null;
      placedHere.push({ slot: a.slot, rect: ok, a });
    }
    return placedHere;
  };
  let list = [...items], scale = 1;
  for (;;) {
    let res: ReturnType<typeof tryPlace> = null;
    for (const s of [1, 0.85, A.side.minScale]) { res = tryPlace(list, s); if (res) { scale = s; break; } }
    if (res) {
      info.shrunkTo = Math.min(info.shrunkTo, scale);
      for (const p of res) if (scale < 1 || fitted.has(p.a.type)) info.limited.push(p.a.type);
      for (const p of res) { out.push({ slot: p.slot as SlotName, rect: p.rect, rot: 0, z: A.z.side }); info.placed.push({ slot: p.slot, type: p.a.type, kind: "side", zone: p.a.zone }); }
      return;
    }
    // nothing fits even at the smallest size: drop the lowest-priority item and try again
    const drop = [...list].sort((x, y) => (A.side.priority[x.type] ?? 1) - (A.side.priority[y.type] ?? 1))[0];
    info.dropped.push(`${drop.type}`);
    list = list.filter((x) => x !== drop);
    if (!list.length) return;
  }
}
