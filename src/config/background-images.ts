// Full-screen background PICTURES per combination (dominant season x style family). All values live here. Mechanism: src/lib/background-images.ts.
// The list of existing files is src/config/background-manifest.json (written by scripts/build-bg-manifest.ts / add-backgrounds.ts); the code never probes URLs.
import manifest from "./background-manifest.json";

export const BG_SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const BG_FAMILIES = ["smart", "street", "active", "rugged", "soft"] as const;
export const BG_NEUTRAL = "neutral";
export const BG_PER_COMBO = 3;                     // images per combination (1..3)
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
export const BG_IMAGE = { width: 1080, height: 2340, quality: 80, maxKb: 250 };   // output of scripts/add-backgrounds.ts

/** every allowed file name (without .webp): 15 combinations x 3 + neutral x 3 = 48 */
export const BG_ALLOWED: readonly string[] = [...BG_COMBOS, BG_NEUTRAL].flatMap((c) => Array.from({ length: BG_PER_COMBO }, (_, i) => `${c}-${i + 1}`));

/** names (no extension) of the images that exist, from the manifest */
export const BG_MANIFEST: readonly string[] = (manifest.images as string[]).map((f) => f.replace(/\.webp$/, ""));
