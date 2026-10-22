// Display-only grouping of the 24 detailed styles into 5 families (used for the small icon on each outfit card). Edit here only.
// The detailed styles stay as they are for classification, the feed and personalization. Every style must appear in exactly one family (tests/style-families.test.ts).
import type { StyleKey } from "@/classify/styles";

export const STYLE_FAMILIES = {
  smart: ["old_money", "quiet_luxury", "classic", "business_casual", "preppy", "dark_academia", "minimalism", "scandi"],   // smart, elegant, calm
  street: ["streetwear", "skater", "y2k", "grunge", "punk_edgy", "techwear"],                                              // urban, edgy
  active: ["sporty", "athleisure", "gorpcore", "retro_sport"],                                                             // sport and outdoor
  rugged: ["workwear", "western", "vintage"],                                                                              // heritage, durable, worn-in
  soft: ["coquette", "boho", "resort"],                                                                                    // romantic, flowy, holiday
} as const satisfies Record<string, readonly StyleKey[]>;

export type StyleFamily = keyof typeof STYLE_FAMILIES;
export const FAMILY_KEYS = Object.keys(STYLE_FAMILIES) as StyleFamily[];

const BY_STYLE = new Map<string, StyleFamily>(FAMILY_KEYS.flatMap((f) => (STYLE_FAMILIES[f] as readonly string[]).map((s) => [s, f] as const)));
export const familyOf = (style: string | null | undefined): StyleFamily | null => (style ? BY_STYLE.get(style) ?? null : null);
