// Pure layout engine: (outfit pieces, template, seed, canvas size) -> rectangles in px. No React, no DOM.
import { computeRuleLayout } from "./rules";
import {
  DEFAULT_ASPECT, FRAME_PAD, HEADER_PX, FOOTER_PX, JITTER, MARGIN_ZONE, MAX_CANVAS_W, OVERLAP, EDGE_PAD, PIECE_SCALE, RULES, SIZE, TEMPLATES,
  type GarmentClass, type Place, type Template,
} from "./config";

export type SlotName = "top" | "bottom" | "shoes" | "full";
export interface PieceIn {
  slot: SlotName; cls: GarmentClass; aspect: number | null; // aspect = content width / height
  presentation?: string | null;                              // spread_front | folded | other (null = unknown, treated as spread)
  hem?: number | null; waist?: number | null;                // seam widths as ratios of the piece's bbox width (tops: hem, bottoms: waist)
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed { slot: SlotName; rect: Rect; rot: number; z: number }
export interface LayoutDebug {
  mode: "stacked" | "folded" | "full"; axisX: number; centreX: number;
  hemLine?: { y: number; x0: number; x1: number }; waistLine?: { y: number; x0: number; x1: number };
  seamMatched?: boolean; ratio?: number; binding: string[]; // which constraints limited the size (class-cap, axis-width, height-fit, ...)
}
export interface Layout {
  fit: number; template: string; margin: "left" | "right"; pieces: Placed[]; frame: Rect; marginRect: Rect; canvas: { w: number; h: number };
  debug?: LayoutDebug;
}

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
  // Rule-based layout (v3) for standard outfits; the random templates only when a template is forced (?layout=A) or RULES.enabled is false.
  if (RULES.enabled && !opts.template) return computeRuleLayout(opts);
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
    const w = Math.min(s.maxW * W * PIECE_SCALE, s.maxH * H * PIECE_SCALE * a);
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
  const pad = EDGE_PAD * W;
  let u = union();
  const s = Math.min(1, ((frame.w - 2 * pad) * 0.995) / u.w, (frame.h * 0.99) / u.h);
  if (s < 1) for (const [, r] of entries) { const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }; r.w *= s; r.h *= s; r.x = u.cx + (c.x - u.cx) * s - r.w / 2; r.y = u.cy + (c.y - u.cy) * s - r.h / 2; }
  u = union();
  let dx = frame.x + frame.w / 2 - u.cx + sym(JITTER.clusterX) * W, dy = frame.y + frame.h / 2 - u.cy + sym(JITTER.clusterY) * H;
  // never leave the canvas, never enter the margin zone (reserved for accessories)
    dx = Math.max(frame.x + pad - u.x0, Math.min(frame.x + frame.w - pad - u.x1, dx)); dy = Math.max(-u.y0 + 2, Math.min(H - 2 - u.y1, dy));
  for (const [, r] of entries) { r.x += dx; r.y += dy; }

  const placed: Placed[] = entries.map(([slot, r]) => ({ slot, rect: r, rot: slot === "shoes" ? sym(JITTER.shoeRotDeg) : 0, z: t.z[slot] }));
  placed.sort((a, b) => a.z - b.z);
  return { fit: s, template: t.id, margin: t.margin, pieces: placed, frame, marginRect, canvas };
}
