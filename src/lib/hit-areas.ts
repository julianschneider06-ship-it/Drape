// Pure tap-area math for outfit cards: visible rects -> enlarged, non-overlapping, card-clamped tap rects. No React, no DOM.
import { HIT_PADDING, type HitCategory } from "@/config/hit-area";

export interface HRect { x: number; y: number; w: number; h: number }
export interface HitPiece { slot: string; rect: HRect; cat: HitCategory }
export interface HitInsets { l: number; t: number; r: number; b: number }   // how far the tap area reaches beyond the visible rect, per side (>= 0)

/**
 * Tap-area insets per piece. Start = HIT_PADDING[category] per side, clamped to the card. Where two pieces' enlarged areas collide, the contested
 * gap between the VISIBLE rects is split at the midpoint (each side gets at most half the gap). Visibly overlapping pieces get no extension toward each other
 * (z-order decides there, as before). `blocked` rects (non-tappable parts, e.g. the attribute icons) are never extended into.
 */
export function hitInsets(pieces: HitPiece[], canvas: { w: number; h: number }, blocked: HRect[] = [], pad: Record<HitCategory, number> = HIT_PADDING): Record<string, HitInsets> {
  const out: Record<string, HitInsets> = {};
  for (const p of pieces) {
    const k = pad[p.cat], r = p.rect;
    out[p.slot] = { l: Math.max(0, Math.min(k, r.x)), t: Math.max(0, Math.min(k, r.y)), r: Math.max(0, Math.min(k, canvas.w - (r.x + r.w))), b: Math.max(0, Math.min(k, canvas.h - (r.y + r.h))) };
  }
  const grow = (a: HRect, i: HitInsets): HRect => ({ x: a.x - i.l, y: a.y - i.t, w: a.w + i.l + i.r, h: a.h + i.t + i.b });
  const hit = (a: HRect, b: HRect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // limit p's side facing q: `cut` = how far beyond p's visible edge the area may reach (>= 0)
  const limit = (s: string, side: keyof HitInsets, cut: number) => { out[s][side] = Math.max(0, Math.min(out[s][side], cut)); };
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const p = pieces[i], q = pieces[j], a = p.rect, b = q.rect;
    if (!hit(grow(a, out[p.slot]), grow(b, out[q.slot]))) continue;
    // signed gaps between the visible rects (negative = they overlap on that axis)
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    if (gx < 0 && gy < 0) {   // visibly overlapping: no extension toward each other on either axis (an extension must never cover the other's visible image)
      const pl = a.x + a.w / 2 < b.x + b.w / 2, pa = a.y + a.h / 2 < b.y + b.h / 2;
      limit(p.slot, pl ? "r" : "l", 0); limit(q.slot, pl ? "l" : "r", 0); limit(p.slot, pa ? "b" : "t", 0); limit(q.slot, pa ? "t" : "b", 0);
      continue;
    }
    const horizontal = gx >= gy;   // separate along the axis with the larger gap (for overlapping rects: the axis with less overlap)
    const g = horizontal ? gx : gy, half = g > 0 ? g / 2 : 0;
    if (horizontal) {
      const pFirst = a.x < b.x;
      limit(p.slot, pFirst ? "r" : "l", half); limit(q.slot, pFirst ? "l" : "r", half);
    } else {
      const pFirst = a.y < b.y;
      limit(p.slot, pFirst ? "b" : "t", half); limit(q.slot, pFirst ? "t" : "b", half);
    }
  }
  // blocked zones: cut the extension at the zone's edge (never shrinks below the visible rect)
  for (const z of blocked) for (const p of pieces) {
    const a = p.rect, o = out[p.slot];
    if (!hit(grow(a, o), z)) continue;
    const gx = Math.max(z.x - (a.x + a.w), a.x - (z.x + z.w)), gy = Math.max(z.y - (a.y + a.h), a.y - (z.y + z.h));
    if (gx >= gy) limit(p.slot, a.x < z.x ? "r" : "l", Math.max(0, gx)); else limit(p.slot, a.y < z.y ? "b" : "t", Math.max(0, gy));
  }
  return out;
}

export const insetsToRect = (r: HRect, i: HitInsets): HRect => ({ x: r.x - i.l, y: r.y - i.t, w: r.w + i.l + i.r, h: r.h + i.t + i.b });
