// Background pictures, pure logic (no React): which picture an outfit gets, and which of the three modes (Off | Sprites | Pictures) is really active.
import { isAllowedName, BG_FALLBACK_FAMILIES, BG_HASH, BG_DIR, BG_MANIFEST, MAX_PER_COMBO, VEIL, VEIL_MAX } from "@/config/background-images";
import { familyOf } from "@/config/style-families";
import { dominantSeason } from "@/lib/season-decor";
import type { OutfitTags } from "@/outfits/tags";
import { migrateSeason, parseSeasonLink, type SeasonMode, type StripeMode } from "@/lib/shop-pref";
export { migrateSeason, parseSeasonLink };

/** Combination key = dominant season ("none" when unclear) + family of style_primary, e.g. "winter-street" (same computation as the season decoration and the icons). */
export function comboKey(t: Pick<OutfitTags, "season_primary" | "season_fit" | "style_primary"> | null | undefined): string {
  return `${dominantSeason(t) ?? "none"}-${familyOf(t?.style_primary) ?? "smart"}`;
}

/** FNV-1a over the sorted ids: the same pieces always give the same number, whatever the order. */
export function outfitHash(ids: readonly number[]): number {
  let h = BG_HASH.seed >>> 0;
  for (const c of [...ids].sort((a, b) => a - b).join(",")) { h ^= c.charCodeAt(0); h = Math.imul(h, BG_HASH.prime) >>> 0; }
  return h >>> 0;
}

/** ids of the parts shown in an outfit (main pieces + accessories) */
export function pieceIds(o: { top: { id: number }; bottom: { id: number } | null; shoes: { id: number }; accessories?: { card: { id: number } }[] }): number[] {
  return [o.top.id, o.bottom?.id, o.shoes.id, ...(o.accessories ?? []).map((a) => a.card.id)].filter((n): n is number => typeof n === "number" && n > 0);
}

export type BgStep = "exact" | "season-smart" | "season-street" | "none";
export type BgPick = { key: string; step: Exclude<BgStep, "none">; index: number; name: string; src: string; label: string };

/** numbers n of the existing images <stem>-<n> (combinations stop at MAX_PER_COMBO) */
const have = (manifest: readonly string[], stem: string): number[] => {
  const out: number[] = [];
  for (const f of manifest) if (f.startsWith(`${stem}-`)) { const n = Number(f.slice(stem.length + 1)); if (Number.isInteger(n) && n >= 1 && String(n) === f.slice(stem.length + 1) && n <= MAX_PER_COMBO) out.push(n); }
  return out.sort((a, b) => a - b);
};

/** murmur3 finalizer: spreads the FNV bits */
const mix = (h: number): number => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
export const hashIndex = (ids: readonly number[]): number => mix(outfitHash(ids)) & 0xffff;

/** Picture for an outfit: exact combination -> same season + smart -> same season + street (first that has images), else null = plain white, no picture, no veil
 *  (also season "none"). The image among several = hash of the sorted piece ids (stable, not random). */
export function pickBackground(t: Parameters<typeof comboKey>[0], ids: readonly number[], manifest: readonly string[] = BG_MANIFEST): BgPick | null {
  const key = comboKey(t), season = dominantSeason(t);
  if (!season) return null;
  const chain: { stem: string; step: BgPick["step"] }[] = [{ stem: key, step: "exact" }];
  BG_FALLBACK_FAMILIES.forEach((f) => { if (`${season}-${f}` !== key) chain.push({ stem: `${season}-${f}`, step: f === "smart" ? "season-smart" : "season-street" }); });
  for (const c of chain) {
    const nums = have(manifest, c.stem); if (!nums.length) continue;
    const index = nums[hashIndex(ids) % nums.length], name = `${c.stem}-${index}`;
    return { key, step: c.step, index, name, src: `${BG_DIR}/${name}.webp`, label: c.step === "exact" ? name : `fallback: ${name}` };
  }
  return null;
}

// ---- readability veil (debug link parameters, never stored) ----
export type VeilSpec = { color: "white" | "black"; opacity: number };
/** ?bgveil=<0..0.8>, ?bgveilcolor=white|black; invalid values are ignored (config default stays) */
export function parseVeil(search: string, base: VeilSpec = VEIL): VeilSpec {
  const q = new URLSearchParams(search), o = q.get("bgveil"), c = q.get("bgveilcolor");
  const n = o !== null && o.trim() !== "" ? Number(o) : NaN;
  return { opacity: Number.isFinite(n) ? Math.min(VEIL_MAX, Math.max(0, n)) : base.opacity, color: c === "white" || c === "black" ? c : base.color };
}

/** manifest entries must be allowed names without duplicates */
export const manifestProblems = (m: readonly string[]): string[] => [...m.filter((n) => !isAllowedName(n)).map((n) => `unknown ${n}`), ...m.filter((n, i) => m.indexOf(n) !== i).map((n) => `duplicate ${n}`)];

// ---- modes ----
export const SEASON_MODES: readonly SeasonMode[] = ["off", "sprites", "pictures"];

/** Pictures and Stripe (Colorful / Simple) never run together. Choosing one switches the other one off (Pictures -> Stripe Off, Stripe -> Sprites). */
export const chooseSeason = (p: { season: SeasonMode; stripe: StripeMode }, season: SeasonMode): { season: SeasonMode; stripe: StripeMode } => ({ season, stripe: season === "pictures" ? "off" : p.stripe });
export const chooseStripe = (p: { season: SeasonMode; stripe: StripeMode }, stripe: StripeMode): { season: SeasonMode; stripe: StripeMode } => ({ stripe, season: stripe !== "off" && p.season === "pictures" ? "sprites" : p.season });

export const PICTURES_WINS_NOTE = "Pictures wins: Stripe treated as Off";
/** The modes that really apply. Link values win over the stored ones; Pictures with an empty manifest behaves like Sprites; Pictures + Stripe on = Pictures wins, Stripe Off (note says so). */
export function resolveModes(a: { seasonLink: string | null; stripeLink: StripeMode | null; local: { season: SeasonMode; stripe: StripeMode }; imageCount: number }): { season: SeasonMode; stripe: StripeMode; note: string | null } {
  let season = parseSeasonLink(a.seasonLink) ?? a.local.season;
  if (season === "pictures" && a.imageCount < 1) season = "sprites";
  let stripe = a.stripeLink ?? a.local.stripe, note: string | null = null;
  if (season === "pictures" && stripe !== "off") { stripe = "off"; note = PICTURES_WINS_NOTE; }
  return { season, stripe, note };
}
