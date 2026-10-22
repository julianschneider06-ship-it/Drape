// Outfit tags: ONE pure function, computed on demand from the pieces of an outfit (never stored in a table). Used for composed outfits, starter outfits and pool outfits
// (the catalogue snapshot provides the piece attributes). The tags are descriptive only: they do not change ranking or the feed yet; later personalization reads them
// from the event payloads (compact form, see compactTags).
import { STYLE_KEYS } from "../classify/styles";
import type { Catalogue, CatAcc, CatPiece } from "./catalogue";
import { outfitSeason, seasonRole, type SeasonName } from "./season";

export interface OutfitTags {
  season_primary: SeasonName; season_fit: number;
  style_primary: string; style_secondary: string | null; style_strength: number; style_distinct: string;
  formality_level: "casual" | "smart_casual" | "formal";
  weather: "warm" | "mild" | "cold"; rain: boolean;
  occasion: "everyday" | "active" | "office" | "evening" | "resort";
  palette: { dominant: string; accent: string | null; kind: "tonal" | "neutral" | "colourful" };
  boldness: "calm" | "bold";
  silhouette: "relaxed" | "regular" | "tailored";
  contrast: boolean; contrast_type: string | null;
  has_outer_layer: boolean; sale_count: number;
}

/** thresholds in one place (tuned on 600 composed outfits per gender, see docs/architecture.md) */
export const TAG_RULES = {
  formality: { casual: 0.36, smart: 0.62 },        // mean formality of the main pieces: < casual -> casual, < smart -> smart_casual, else formal
  silhouette: { relaxed: 0.5, tailored: 0.1 },   // mean volume of top + bottom
  bold: { boldness: 0.5, statement: 0.8 },
  distinctMinShare: 0.1,                           // a style needs this share of the outfit to be "distinct"
};
const NEUTRALS = new Set(["black", "white", "grey", "beige", "cream", "navy", "brown", "silver"]);
export const SPORT = ["sporty", "athleisure", "gorpcore", "retro_sport", "techwear"];
export const SMART = ["business_casual", "classic", "old_money", "quiet_luxury", "preppy"];
export const RESORT = ["resort", "boho", "vintage", "coquette"];
const RAIN = /\b(rain|raincoat|waterproof|anorak|gore-?tex|shell jacket|windbreaker|trench)\b/i;
const idx = (k: string) => STYLE_KEYS.indexOf(k as never);

const meanCache = new WeakMap<Catalogue, Float64Array>();
/** catalogue-wide average style share (each piece counts as a distribution that sums to 1) */
function meanShare(cat: Catalogue): Float64Array {
  let m = meanCache.get(cat); if (m) return m;
  m = new Float64Array(STYLE_KEYS.length); let n = 0;
  for (const p of cat.pieces) { let s = 0; for (let i = 0; i < m.length; i++) s += p.vec[i]; if (s <= 0) continue; for (let i = 0; i < m.length; i++) m[i] += p.vec[i] / s; n++; }
  for (let i = 0; i < m.length; i++) m[i] /= Math.max(1, n);
  meanCache.set(cat, m); return m;
}
const round = (x: number, d = 2) => +x.toFixed(d);
const onSale = (c: unknown) => { const k = c as { compare_at_cents?: number | null; price_cents?: number | null } | undefined; return !!k?.compare_at_cents && k.compare_at_cents > (k.price_cents ?? 0); };

export interface TagInput { pieces: CatPiece[]; accs: CatAcc[]; bucket?: string; pattern?: string | null }

export function outfitTags(cat: Catalogue, { pieces, accs, bucket, pattern }: TagInput): OutfitTags {
  const roles = [...pieces.map((p) => ({ mask: p.mask, role: seasonRole(p.slot, `${p.name} ${p.sub}`, p.outer, p.cold, p.warm) })), ...accs.map((a) => ({ mask: a.mask, role: seasonRole("accessory", "", false, false, false, a.type) }))];
  const season = outfitSeason(roles);
  // styles: summed share of the pieces' style vectors
  const D = STYLE_KEYS.length, sum = new Float64Array(D); let tot = 0;
  for (const p of pieces) { let s = 0; for (let i = 0; i < D; i++) s += p.vec[i]; if (s <= 0) continue; for (let i = 0; i < D; i++) sum[i] += p.vec[i] / s; }
  for (let i = 0; i < D; i++) tot += sum[i];
  const share = Array.from(sum, (v) => (tot > 0 ? v / tot : 0)), order = share.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const mean = meanShare(cat);
  let distinct = order[0][1], best = -1; for (const [v, i] of order) if (v >= TAG_RULES.distinctMinShare) { const lift = v / Math.max(0.01, mean[i]); if (lift > best) { best = lift; distinct = i; } }
  const primary = STYLE_KEYS[order[0][1]], secondary = order[1][0] >= 0.1 ? STYLE_KEYS[order[1][1]] : null;
  const sh = (keys: string[]) => keys.reduce((a, k) => a + (share[idx(k)] ?? 0), 0);

  const form = pieces.reduce((a, p) => a + p.formality, 0) / pieces.length;
  const formality_level = form < TAG_RULES.formality.casual ? "casual" : form < TAG_RULES.formality.smart ? "smart_casual" : "formal";
  const warmAcc = accs.some((a) => a.type === "sunglasses"), coldAcc = accs.some((a) => ["beanie", "scarf", "gloves"].includes(a.type));
  const warmP = pieces.some((p) => p.warm), coldP = pieces.some((p) => p.cold);
  const weather = coldP || coldAcc || season.season === "winter" ? "cold" : warmP || (warmAcc && season.season === "summer") || season.season === "summer" ? "warm" : "mild";
  const rain = pieces.some((p) => RAIN.test(`${p.name} ${p.sub}`));

  const full = pieces.some((p) => p.slot === "full_body"), shoe = pieces.find((p) => p.slot === "shoes");
  const heels = !!shoe && /\b(heel|pump|stiletto|slingback|court)s?\b/i.test(`${shoe.sub} ${shoe.name}`);
  const dominantEarly = [...pieces.reduce((m, p) => m.set(p.main, (m.get(p.main) ?? 0) + (p.slot === "shoes" ? 0.5 : 1.2)), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0][0];
  let occasion: OutfitTags["occasion"] = "everyday";
  if (sh(SPORT) >= 0.5 && form < 0.5) occasion = "active";
  else if (form >= 0.62 && (full || heels || ["black", "navy", "burgundy"].includes(dominantEarly))) occasion = "evening";
  else if (form >= 0.55 && sh(SMART) >= 0.45) occasion = "office";
  else if ((weather === "warm" || season.season === "summer") && (sh(RESORT) >= 0.25 || (full && form < 0.5 && sh(SPORT) < 0.3) || (pieces.some((p) => p.short) && /\b(sandal|loafer|espadrille|slide)s?\b/i.test(shoe?.sub ?? "") && form < 0.5))) occasion = "resort";

  // palette: weighted colours of the main pieces (full-body counts double)
  const w = new Map<string, number>(); for (const p of pieces) w.set(p.main, (w.get(p.main) ?? 0) + (p.slot === "shoes" ? 0.5 : p.slot === "full_body" ? 2 : 1.2));
  const ranked = [...w].sort((a, b) => b[1] - a[1]), dominant = ranked[0][0];
  const hues = ranked.filter(([c]) => !NEUTRALS.has(c) && c !== "multicolor").map(([c]) => c);
  const accent = hues.find((c) => c !== dominant) ?? (NEUTRALS.has(dominant) ? (hues[0] ?? null) : null);
  const top = pieces.find((p) => p.slot === "top" || p.slot === "full_body"), bottom = pieces.find((p) => p.slot === "bottom");
  const sameTB = !!top && !!bottom && top.main === bottom.main;
  const kind = hues.length >= 2 || pieces.some((p) => p.main === "multicolor") ? "colourful" : sameTB || (hues.length === 1 && pieces.filter((p) => p.main === hues[0]).length >= 2) ? "tonal" : "neutral";

  const bold = pieces.reduce((a, p) => a + p.boldness, 0) / pieces.length >= TAG_RULES.bold.boldness || pieces.some((p) => p.statement >= TAG_RULES.bold.statement);
  const vp = pieces.filter((p) => p.slot === "top" || p.slot === "bottom" || p.slot === "full_body"), vol = vp.reduce((a, p) => a + p.volume, 0) / Math.max(1, vp.length);
  const silhouette = vol >= TAG_RULES.silhouette.relaxed ? "relaxed" : vol <= TAG_RULES.silhouette.tailored ? "tailored" : "regular";

  const cards = [...pieces.map((p) => p.card), ...accs.map((a) => a.card)];
  return {
    season_primary: season.season, season_fit: round(season.fit),
    style_primary: primary, style_secondary: secondary, style_strength: round(order[0][0]), style_distinct: STYLE_KEYS[distinct],
    formality_level, weather, rain, occasion,
    palette: { dominant, accent, kind },
    boldness: bold ? "bold" : "calm", silhouette,
    contrast: bucket === "contrast", contrast_type: bucket === "contrast" ? (pattern ?? null) : null,
    has_outer_layer: pieces.some((p) => p.outer), sale_count: cards.filter(onSale).length,
  };
}

/** compact form for event payloads (about 150 bytes) */
export function compactTags(t: OutfitTags) {
  return { se: t.season_primary, sf: t.season_fit, sp: t.style_primary, ss: t.style_secondary, sg: t.style_strength, sd: t.style_distinct, fo: t.formality_level, w: t.weather, r: t.rain ? 1 : 0, oc: t.occasion,
    pd: t.palette.dominant, pa: t.palette.accent, pk: t.palette.kind, bo: t.boldness, si: t.silhouette, ct: t.contrast ? 1 : 0, ctt: t.contrast_type, ol: t.has_outer_layer ? 1 : 0, sc: t.sale_count };
}
export type CompactTags = ReturnType<typeof compactTags>;
const KEYS_S = ["se", "sp", "ss", "sd", "fo", "w", "oc", "pd", "pa", "pk", "bo", "si", "ctt"], KEYS_N = ["sf", "sg", "r", "ct", "ol", "sc"];
/** server side: keep only known keys with short values (the payload comes from the browser) */
export function cleanCompactTags(x: unknown): Record<string, string | number | null> | null {
  if (!x || typeof x !== "object") return null; const o = x as Record<string, unknown>, out: Record<string, string | number | null> = {};
  for (const k of KEYS_S) { const v = o[k]; if (v === null) out[k] = null; else if (typeof v === "string" && v.length <= 40) out[k] = v; }
  for (const k of KEYS_N) { const v = o[k]; if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1000) out[k] = v; }
  return Object.keys(out).length ? out : null;
}
/** one readable line for the ?debug=1 overlay */
export const tagLine = (t: OutfitTags) => `${t.season_primary} ${t.season_fit} | ${t.style_primary}${t.style_secondary ? "/" + t.style_secondary : ""} ${t.style_strength} (distinct ${t.style_distinct}) | ${t.formality_level} | ${t.weather}${t.rain ? "+rain" : ""} | ${t.occasion} | ${t.palette.dominant}${t.palette.accent ? "+" + t.palette.accent : ""} ${t.palette.kind} | ${t.boldness} | ${t.silhouette}${t.contrast ? " | break: " + (t.contrast_type ?? "yes") : ""}${t.has_outer_layer ? " | outer" : ""}${t.sale_count ? " | sale " + t.sale_count : ""}`;
