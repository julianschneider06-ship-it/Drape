// Full-screen background PICTURES per combination (dominant season x style family). All values live here. Mechanism: src/lib/background-images.ts.
// The list of existing files is src/config/background-manifest.json (written by scripts/build-bg-manifest.ts / add-backgrounds.ts); the code never probes URLs.
import manifest from "./background-manifest.json";

export const BG_SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const BG_FAMILIES = ["smart", "street", "active", "rugged", "soft"] as const;
export const BG_NEUTRAL = "neutral";
export const MAX_PER_COMBO = 5;                    // images per combination (1..MAX_PER_COMBO), easy to raise; the neutral pool is open-ended (neutral-<n>, n >= 1)
export const NEUTRAL_SHARE = 0.25;                 // share of outfits that get a neutral picture although their combination has pictures (rest: combination chain)
export const VEIL: { color: "white" | "black"; opacity: number } = { color: "white", opacity: 0 };   // readability veil over the picture, below the products; 0 = none. Link tuning: ?bgveil=0..0.8, ?bgveilcolor=white|black (debug, not stored)
export const VEIL_MAX = 0.8;
// PICTURE VEIL setting (Profile "Picture veil", Prompt 96): Off | Light | Dynamic | Dark. Only active in Pictures mode with a picture drawn. ?veil=off|light|dynamic|dark overrides the stored value.
export const DEFAULT_VEIL_MODE = "dynamic" as const;   // default when nothing is stored
export const VEIL_STRENGTH = 0.3;                  // Light (white) / Dark (black): fixed opacity
export const DYN_DARK_BELOW = 0.25;                // Dynamic: part luminance below this = dark
export const DYN_LIGHT_ABOVE = 0.6;                // Dynamic: part luminance above this = light (in between / unknown colour = mid)
export const DYN_MIN_STRENGTH = 0.12;              // Dynamic: opacity at |dark - light| -> 0 (but not tied)
export const DYN_MAX_STRENGTH = 0.35;              // Dynamic: opacity when all parts are dark (or all light)
export const BG_DIR = "/backgrounds";              // public/backgrounds/<name>.webp
/** The 15 combinations that may have their own images (season-family): 12 = four seasons x smart/street/active, plus three extended ones. */
export const BG_COMBOS: readonly string[] = [
  ...BG_SEASONS.flatMap((s) => (["smart", "street", "active"] as const).map((f) => `${s}-${f}`)),
  "autumn-rugged", "winter-rugged", "summer-soft",
];
/** Fallback when the exact combination has no image: same season + these families in order, then the neutral set (also used for "no clear season"). */
export const BG_FALLBACK_FAMILIES = ["smart", "street"] as const;
export const BG_FADE_MS = 450;                     // crossfade between two outfits' pictures
export const BG_PRELOAD_NEXT = true;               // preload the picture of the next outfit (one small request, only when it has one)
export const BG_HASH = { seed: 2166136261, prime: 16777619 };   // FNV-1a over the sorted piece ids -> stable image choice per outfit
export const BG_IMAGE = { width: 1080, height: 1920, quality: 80, minQuality: 40, qualityStep: 10, maxKb: 250, ratioTolerance: 0.03 };   // output of scripts/add-backgrounds.ts (9:16)

/** allowed file name (without .webp): <season>-<family>-<1..MAX_PER_COMBO> for the 15 combinations, or neutral-<n> with any n >= 1 */
export function isAllowedName(name: string): boolean {
  const m = /^(.+)-([1-9]\d*)$/.exec(name); if (!m) return false;
  const n = Number(m[2]);
  return m[1] === BG_NEUTRAL ? true : BG_COMBOS.includes(m[1]) && n <= MAX_PER_COMBO;
}

/** names (no extension) of the images that exist, from the manifest */
export const BG_MANIFEST: readonly string[] = (manifest.images as string[]).map((f) => f.replace(/\.webp$/, ""));
