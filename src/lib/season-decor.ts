// Seasonal decoration, pure logic (no React): which season an outfit gets, which part of the screen belongs to which outfit, and the setting.
import { SEASON_DECOR } from "@/config/season-decor";
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
