// Seasonal decoration, pure logic (no React): which season an outfit gets, which part of the screen belongs to which outfit, and the setting.
import { SEASON_DECOR, DECOR_OVERSCAN_PX, type DecorAnchor, type DecorLayer } from "@/config/season-decor";
import type { OutfitTags } from "@/outfits/tags";

export type DecorSeason = "spring" | "summer" | "autumn" | "winter";

/** Dominant season of an outfit = the season behind its season icon (`tags.season_primary`, computed by `outfitSeason` from the pieces' season lists).
 *  null (no decoration) when there are no tags, the outfit is all-season, or the pieces disagree / the season is unclear (`season_fit` < minFit). */
export function dominantSeason(t: Pick<OutfitTags, "season_primary" | "season_fit"> | null | undefined, minFit: number = SEASON_DECOR.minFit): DecorSeason | null {
  if (!t) return null;
  const s = t.season_primary;
  if (s !== "spring" && s !== "summer" && s !== "autumn" && s !== "winter") return null;
  return typeof t.season_fit === "number" && t.season_fit >= minFit ? s : null;
}

/** Part of the decor area that belongs to the outfit at `index`: the scroller shows that outfit in [index*h - scrollTop, +h]. Returned as insets from the top and
 *  bottom of the area (px, for clip-path inset); null = the outfit is not on screen at all. The decorations stay still, only this window moves with the swipe. */
export function decorClip(index: number, scrollTop: number, h: number): { top: number; bottom: number } | null {
  if (!(h > 0)) return null;
  const y0 = index * h - scrollTop, y1 = y0 + h;
  const top = Math.min(h, Math.max(0, y0)), bottom = Math.min(h, Math.max(0, h - y1));
  return top + bottom >= h ? null : { top, bottom };
}

/** Outfits that can be (partly) on screen: the nearest one and both neighbours (changes only at the halfway point of a swipe, so React renders rarely). */
export function decorWindow(scrollTop: number, h: number, count: number): number[] {
  if (!(h > 0) || count <= 0) return [];
  const c = Math.min(count - 1, Math.max(0, Math.round(scrollTop / h)));
  return [c - 1, c, c + 1].filter((i) => i >= 0 && i < count);
}

/** Effective setting: ?season=0|1 link wins (testing), otherwise the Profile choice (device only, default on). */
export const effectiveSeason = (link: string | null, localOn: boolean): boolean => (link === "1" ? true : link === "0" ? false : localOn);

/** Decoration look: ?decor=pixel = the old pixel art, anything else (or missing) = the painted illustrations. Link parameter only. */
export type DecorMode = "art" | "pixel";
export const parseDecorMode = (link: string | null | undefined): DecorMode => (link === "pixel" ? "pixel" : "art");

/** Pixel box of one art layer inside the full-screen decor layer of W x H px (the real screen edges). Flush sides sit DECOR_OVERSCAN_PX beyond the edge, no safe area.
 *  Stretched layers keep their distortion within +/- maxStretch of the natural aspect (the height gives way). null = layer not measured yet. */
export function artLayerStyle(l: DecorLayer, W: number, H: number): Record<string, string | number> | null {
  if (!(W > 0 && H > 0)) return null;
  const os = DECOR_OVERSCAN_PX, flush = l.flush ?? [], a = l.aspect;
  let w: number, h: number;
  if (l.widthMode === "screen") w = W + 2 * os; else if (l.widthPct != null) w = (W * l.widthPct) / 100; else w = ((H * (l.heightPct ?? 0)) / 100) * a;
  h = l.heightPct != null ? (H * l.heightPct) / 100 : w / a;
  if (l.stretch && l.heightPct != null) {
    const m = l.maxStretch ?? 0.2, r = Math.min(1 + m, Math.max(1 - m, w / h / a));
    h = w / (a * r);
  }
  const st: Record<string, string | number> = { position: "absolute", opacity: l.opacity, zIndex: l.zIndex, maxWidth: "none", width: w, height: h };
  const an = l.anchor, top = an.startsWith("top"), bottom = an.startsWith("bottom"), left = an.endsWith("left") || an === "left", right = an.endsWith("right") || an === "right";
  if (top) st.top = flush.includes("top") ? -os : (H * l.offsetYPct) / 100; else if (bottom) st.bottom = flush.includes("bottom") ? -os : -(H * l.offsetYPct) / 100; else { st.top = "50%"; st.transform = "translateY(-50%)"; }
  if (left) st.left = flush.includes("left") ? -os : (W * l.offsetXPct) / 100; else if (right) st.right = flush.includes("right") ? -os : -(W * l.offsetXPct) / 100; else st.left = (W - w) / 2;
  if (an === "bottom" || an === "top") st.left = flush.includes("left") && l.widthMode === "screen" ? -os : (W - w) / 2 + (W * l.offsetXPct) / 100;
  return st;
}

/** Clip of outfit `index`'s ART group inside the full-screen layer. The scroller sits `off` px below the layer's top and is `h` px tall (one outfit = h).
 *  Only the edge that borders a neighbouring outfit is cut (that line moves with the swipe); at rest nothing is cut, so the art runs to the real screen edges. null = hidden. */
export function artClip(index: number, scrollTop: number, h: number, off: number, layerH: number): { top: number; bottom: number } | null {
  if (!(h > 0)) return null;
  const y0 = index * h - scrollTop, y1 = y0 + h;
  if (y1 <= 0 || y0 >= h) return null;
  return { top: y0 > 0 ? Math.max(0, off + y0) : 0, bottom: y1 < h ? Math.max(0, layerH - (off + y1)) : 0 };
}
