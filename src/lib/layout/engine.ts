// Pure layout engine: (outfit pieces, template, seed, canvas size) -> rectangles in px. No React, no DOM.
import {
  DEFAULT_ASPECT, FRAME_PAD, HEADER_PX, FOOTER_PX, JITTER, MARGIN_ZONE, MAX_CANVAS_W, OVERLAP, SIZE, TEMPLATES,
  type GarmentClass, type Place, type Template,
} from "./config";

export type SlotName = "top" | "bottom" | "shoes" | "full";
export interface PieceIn { slot: SlotName; cls: GarmentClass; aspect: number | null } // aspect = content width / height
export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed { slot: SlotName; rect: Rect; rot: number; z: number; heart: { x: number; y: number } }
export interface Layout { template: string; margin: "left" | "right"; pieces: Placed[]; frame: Rect; marginRect: Rect; canvas: { w: number; h: number } }

export const HEART_PX = 30;

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Canvas size from the scroller size: centred, max width, minus header/footer. */
export const canvasSize = (viewW: number, viewH: number) => ({ w: Math.round(Math.min(viewW, MAX_CANVAS_W)), h: Math.max(240, Math.round(viewH - HEADER_PX - FOOTER_PX)) });

/** Deterministic template choice; `override` = list of ids from ?layout=A,FB (case-insensitive, "m" = mirrored). */
export function pickTemplate(kind: "three" | "full", seed: number, override?: string[]): Template {
  const ofKind = TEMPLATES.filter((t) => t.kind === kind);
  const forced = override?.map((o) => ofKind.find((t) => t.id.toLowerCase() === o.toLowerCase())).find(Boolean);
  return forced ?? ofKind[seed % ofKind.length];
}

export function computeLayout(opts: { kind: "three" | "full"; pieces: Partial<Record<SlotName, PieceIn>>; seed: number; canvas: { w: number; h: number }; template?: Template }): Layout {
  const { canvas } = opts, W = canvas.w, H = canvas.h;
  const t = opts.template ?? pickTemplate(opts.kind, opts.seed);
  const rnd = mulberry32(opts.seed ^ 0x9e3779b9);
  const between = ([a, b]: [number, number]) => a + (b - a) * rnd();
  const sym = (m: number) => (rnd() * 2 - 1) * m;

  const mz = MARGIN_ZONE * W;
  const frame: Rect = { x: t.margin === "left" ? mz : 0, y: FRAME_PAD * H, w: W - mz, h: H * (1 - 2 * FRAME_PAD) };
  const marginRect: Rect = { x: t.margin === "left" ? 0 : W - mz, y: 0, w: mz, h: H };

  // 1) sizes by garment class
  const size = (p: PieceIn) => {
    const s = SIZE[p.cls], a = p.aspect && p.aspect > 0.05 ? p.aspect : DEFAULT_ASPECT[p.cls];
    const w = Math.min(s.maxW * W, s.maxH * H * a);
    return { w, h: w / a };
  };
  const rect: Partial<Record<SlotName, Rect>> = {};
  const centre = (p: Place, sz: { w: number; h: number }): Rect => ({
    x: frame.x + p.cx * frame.w - sz.w / 2, y: frame.y + (p.cy ?? 0.5) * frame.h - sz.h / 2, ...sz,
  });

  // 2) absolute pieces first (top / full), then bottom (below the top or absolute), then shoes (at the hem)
  for (const s of ["top", "full"] as const) {
    const p = opts.pieces[s], place = t[s];
    if (p && place) rect[s] = centre(place, size(p));
  }
  if (opts.pieces.bottom && t.bottom) {
    const sz = size(opts.pieces.bottom), pl = t.bottom;
    const r = centre(pl, sz);
    if (pl.below && rect.top) r.y = rect.top.y + rect.top.h - between(pl.below.overlap) * rect.top.h;
    rect.bottom = r;
  }
  if (opts.pieces.shoes) {
    const sz = size(opts.pieces.shoes), pl = t.shoes, hem = pl.hem;
    const r = centre(pl, sz);
    const anchor = hem ? rect[hem.of] : undefined;
    if (hem && anchor) {
      r.y = anchor.y + anchor.h - between(OVERLAP.hemY) * sz.h;                       // shoes overlap the hem by 15-25% of their height
      if (hem.side === 1) r.x = anchor.x + anchor.w - hem.overlapX * sz.w;
      else if (hem.side === -1) r.x = anchor.x - sz.w + hem.overlapX * sz.w;
      // side 0 / "free": keep the template's absolute x
    }
    r.x += sym(JITTER.shoesX) * W;
    rect.shoes = r;
  }

  // 3) fit the whole composition into the usable frame (scale down only if it does not fit), centre it, jitter it
  const entries = (Object.entries(rect) as [SlotName, Rect][]);
  const union = () => {
    const x0 = Math.min(...entries.map(([, r]) => r.x)), y0 = Math.min(...entries.map(([, r]) => r.y));
    const x1 = Math.max(...entries.map(([, r]) => r.x + r.w)), y1 = Math.max(...entries.map(([, r]) => r.y + r.h));
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  };
  let u = union();
  const s = Math.min(1, (frame.w * 0.98) / u.w, (frame.h * 0.98) / u.h);
  if (s < 1) for (const [, r] of entries) { const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; r.w *= s; r.h *= s; r.x = u.cx + (c.x - u.cx) * s - r.w / 2; r.y = u.cy + (c.y - u.cy) * s - r.h / 2; }
  u = union();
  let dx = frame.x + frame.w / 2 - u.cx + sym(JITTER.clusterX) * W, dy = frame.y + frame.h / 2 - u.cy + sym(JITTER.clusterY) * H;
  // never leave the canvas
  dx = Math.max(-u.x0 + 2, Math.min(W - 2 - u.x1, dx)); dy = Math.max(-u.y0 + 2, Math.min(H - 2 - u.y1, dy));
  for (const [, r] of entries) { r.x += dx; r.y += dy; }

  // 4) hearts: one per piece at the corner with the least overlap with other pieces / hearts
  const placed: Placed[] = entries.map(([slot, r]) => ({ slot, rect: r, rot: slot === "shoes" ? sym(JITTER.shoeRotDeg) : 0, z: t.z[slot], heart: { x: 0, y: 0 } }));
  const hearts: { x: number; y: number }[] = [];
  const half = HEART_PX / 2, clampX = (x: number) => Math.max(half, Math.min(W - half, x)), clampY = (y: number) => Math.max(half, Math.min(H - half, y));
  for (const p of [...placed].sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)) {
    const r = p.rect;
    const corners = [[r.x + r.w, r.y + r.h], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x, r.y]];
    let best = { score: Infinity, x: 0, y: 0 };
    corners.forEach(([cx, cy], i) => {
      const x = clampX(cx), y = clampY(cy);
      let score = i * 2;
      for (const o of placed) {
        if (o === p) continue;
        const ox = Math.max(0, Math.min(x + half, o.rect.x + o.rect.w) - Math.max(x - half, o.rect.x));
        const oy = Math.max(0, Math.min(y + half, o.rect.y + o.rect.h) - Math.max(y - half, o.rect.y));
        score += (ox * oy) / 20;
      }
      for (const h of hearts) if (Math.hypot(h.x - x, h.y - y) < HEART_PX + 4) score += 1000;
      if (score < best.score) best = { score, x, y };
    });
    p.heart = { x: best.x, y: best.y }; hearts.push(best);
  }
  placed.sort((a, b) => a.z - b.z);
  return { template: t.id, margin: t.margin, pieces: placed, frame, marginRect, canvas };
}
