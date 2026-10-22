// Which small attribute icons an outfit card shows (display only). Pure: computed from the outfit tags the feed already carries (no new data, no requests).
// Order: style family, season, then up to MAX_EXTRA notable attributes. Generic values (everyday, neutral palette, regular fit ...) never get an icon.
import type { OutfitTags } from "@/outfits/tags";
import { familyOf, type StyleFamily } from "@/config/style-families";

export type ExtraIcon = "rain" | "evening" | "office" | "resort" | "contrast" | "bold" | "tonal" | "colourful" | "formal";
export type IconId = `family-${StyleFamily}` | `season-${"spring" | "summer" | "autumn" | "winter"}` | ExtraIcon;
export const MAX_EXTRA = 3;

export function outfitIcons(t: OutfitTags | null | undefined): IconId[] {
  if (!t) return [];
  const out: IconId[] = [];
  const fam = familyOf(t.style_primary); if (fam) out.push(`family-${fam}`);
  if (t.season_primary !== "all") out.push(`season-${t.season_primary}`);
  const extra: ExtraIcon[] = [];
  if (t.rain) extra.push("rain");
  if (t.occasion === "evening" || t.occasion === "office" || t.occasion === "resort") extra.push(t.occasion);
  if (t.contrast) extra.push("contrast");
  if (t.boldness === "bold") extra.push("bold");
  if (t.palette.kind === "tonal" || t.palette.kind === "colourful") extra.push(t.palette.kind);
  if (t.formality_level === "formal" && !extra.includes("evening") && !extra.includes("office")) extra.push("formal");
  return [...out, ...extra.slice(0, MAX_EXTRA)];
}
