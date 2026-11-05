// Seasonal decoration, pure logic (no React): which season an outfit gets, which part of the screen belongs to which outfit, and the setting.
import { SEASON_DECOR, type DecorAnchor, type DecorLayer } from "@/config/season-decor";
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

/** CSS box of one art layer inside the decor area. `safeTop` / `safeBottom` add the status-bar inset / the tab-bar inset (--safe-b) to the matching edge. */
export function artLayerStyle(l: DecorLayer, safeTop: boolean): Record<string, string | number> {
  const a: DecorAnchor = l.anchor, st: Record<string, string | number> = { position: "absolute", opacity: l.opacity, zIndex: l.zIndex, maxWidth: "none" };
  if (l.widthPct != null) { st.width = `${l.widthPct}%`; st.height = "auto"; } else { st.height = `${l.heightPct ?? 0}%`; st.width = "auto"; }
  const top = a.startsWith("top"), bottom = a.startsWith("bottom"), left = a.endsWith("left") || a === "left", right = a.endsWith("right") || a === "right";
  const ox = `${left ? l.offsetXPct : right ? -l.offsetXPct : l.offsetXPct}%`, oy = `${top ? l.offsetYPct : -l.offsetYPct}%`;
  if (top) st.top = safeTop ? `calc(env(safe-area-inset-top, 0px) + ${oy})` : oy;
  else if (bottom) st.bottom = `calc(var(--safe-b, 0px) + ${oy})`;
  else { st.top = "50%"; st.transform = "translateY(-50%)"; }
  if (left) st.left = ox; else if (right) st.right = ox; else { st.left = "50%"; st.transform = `${st.transform ?? ""} translateX(-50%)`.trim(); }
  return st;
}
