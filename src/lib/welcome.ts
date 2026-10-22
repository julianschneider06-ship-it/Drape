// Welcome / preference flow (before the tutorial): gender + up to 5 styles, held on the device only (localStorage).
import { STYLE_KEYS, type StyleKey } from "@/classify/styles";

export const MAX_STYLES = 5;
/** the chosen styles (JSON array of style keys); the gender goes to the feed's own key "drape.gender" */
export const STYLES_KEY = "drape.styles";
/** display name of a style key (no names exist elsewhere in the app): old_money -> "Old Money", y2k -> "Y2K" */
export const styleLabel = (k: string) => (k === "y2k" ? "Y2K" : k.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "));
export const ALL_STYLES: StyleKey[] = STYLE_KEYS;
export function cleanStyles(x: unknown): StyleKey[] {
  if (!Array.isArray(x)) return [];
  return [...new Set(x)].filter((k): k is StyleKey => (STYLE_KEYS as string[]).includes(k as string)).slice(0, MAX_STYLES);
}

/** a style is offered in the picker only if the gender's pool has at least this many active outfits of it (display only, no data is changed) */
export const MIN_STYLE_OUTFITS = 1;
/** the styles to offer: those with >= MIN_STYLE_OUTFITS outfits in `counts` (style key -> pool outfits), in the usual order. No counts (query failed) = all styles. */
export function availableStyles(counts: Record<string, number> | null | undefined, min = MIN_STYLE_OUTFITS): StyleKey[] {
  if (!counts || typeof counts !== "object") return ALL_STYLES;
  return ALL_STYLES.filter((k) => (Number(counts[k]) || 0) >= min);
}
/** the stored picks only count for the gender they were picked for (the styles on offer differ per gender) */
export const STYLES_GENDER_KEY = "drape.stylesFor";
