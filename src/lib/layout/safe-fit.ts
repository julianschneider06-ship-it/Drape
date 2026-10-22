// Safe area fit (display only): every piece's visible bounds, plus the Search price tag when there is one, must lie inside [LAYOUT_SAFE_MARGIN.top, H - bottom].
// If they do not, the WHOLE composition is scaled down uniformly (and shifted if it only sits too high / too low), so nothing starts to overlap.
// Side-by-side scales around the centre line, so the top stays centred on it and the 15% offset ratio holds. Hit areas, likes, sale labels and shine
// follow because they all read the final rectangles.
import { LAYOUT_SAFE_MARGIN } from "@/config/layout-safe";
import { PRICE_TAG } from "@/config/search";
import { SIDE_BY_SIDE as SBS } from "@/config/side-by-side";
import type { Layout, SlotName } from "./engine";

export const MIN_SAFE_SCALE = 0.3;

export function fitSafeArea(layout: Layout, tag?: { slot: SlotName; w: number; h: number }, safe = LAYOUT_SAFE_MARGIN): Layout {
  const H = layout.canvas.h, top = safe.top, bot = H - safe.bottom, eps = 0.01;
  if (bot - top < 60 || !layout.pieces.length) return layout;
  const folded = layout.debug?.mode === "folded";
  const ext = (s: number, py: number) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of layout.pieces) {
      const y0 = py + (p.rect.y - py) * s, y1 = y0 + p.rect.h * s;
      lo = Math.min(lo, y0); hi = Math.max(hi, tag && p.slot === tag.slot ? y1 + PRICE_TAG.gap + tag.h : y1);
    }
    return { lo, hi };
  };
  const e1 = ext(1, 0);
  const py = folded ? SBS.centerY * H : (e1.lo + e1.hi) / 2;
  const fits = (s: number) => { const e = ext(s, py); return folded ? e.lo >= top - eps && e.hi <= bot + eps : e.hi - e.lo <= bot - top + eps; };
  let s = 1;
  if (!fits(1)) { let lo = MIN_SAFE_SCALE, hi = 1; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; } s = fits(lo) ? lo : MIN_SAFE_SCALE; }
  const e = ext(s, py);
  const dy = folded ? 0 : e.lo < top ? top - e.lo : e.hi > bot ? bot - e.hi : 0;
  if (s === 1 && Math.abs(dy) < eps) return layout;
  const xs = layout.pieces.map((p) => p.rect.x), xe = layout.pieces.map((p) => p.rect.x + p.rect.w), px = (Math.min(...xs) + Math.max(...xe)) / 2;
  return {
    ...layout, fit: layout.fit * s,
    pieces: layout.pieces.map((p) => ({ ...p, rect: { x: px + (p.rect.x - px) * s, y: py + (p.rect.y - py) * s + dy, w: p.rect.w * s, h: p.rect.h * s } })),
    debug: layout.debug ? { ...layout.debug, safeScale: s, safeShift: dy } : layout.debug,
  };
}
