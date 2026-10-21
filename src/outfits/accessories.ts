// Accessory assembly rules (pure functions, no I/O): which 0-3 accessories go with an outfit, and where they are placed.
// Everything tunable is in ACC (top of the file). The builder script feeds these functions; the layout engine only draws the result.
import { STYLE_KEYS } from "../classify/styles";
import type { Piece } from "./score";

export interface RawAcc {
  id: number; name: string; store: string; type: string; size: string | null; front_flat: boolean | null; belt_shape: string | null; gender: string | null;
  styles: Record<string, number>; colors: string[]; pattern: string; material: string | null; formality: number; boldness: number; statement: number; season: string[];
}
export interface Acc {
  id: number; store: string; type: string; genders: ("women" | "men")[]; vec: Float32Array; main: string; accent: string | null; mask: number;
  formality: number; statement: number; bold: number; frontFlat: boolean; beltShape: string | null;
}
export type Placement = "head" | "inline" | "side";
export interface Pick { acc: Acc; score: number; placement: Placement; zone: string }

export const ACC = {
  minScore: [0.5, 0.56, 0.68],          // minimum score for the 1st, 2nd, 3rd accessory
  minStyleSim: 0.15,                    // accessory style vector vs the outfit's (cosine); below = rejected
  formalityTol: 0.45,                   // |accessory formality - outfit formality| beyond this = rejected
  tailoredFormality: 0.68,              // outfit formality (mean) at or above this = tailored / formal: no hat, no backpack
  statementMin: 0.7,                    // a "statement piece"
  reusePenalty: 0.28,                   // score x 1/(1 + penalty * uses so far)
  recentWindow: 14,                     // same accessory or same store within the last N outfits of the feed order = penalised
  recentPenalty: 0.55,
  weights: { style: 0.4, colour: 0.2, formal: 0.2, season: 0.1, type: 0.1 },
  // how much each type is wanted as one of the (prefer 2) accessories; head items and bags are the most characteristic
  typeBase: { cap: 0.9, hat: 0.95, beanie: 0.95, bag: 1, backpack: 0.8, sunglasses: 0.85, watch: 0.9, necklace: 0.9, bracelet: 0.85, earrings: 0.8, ring: 0.75,
              belt: 0.85, scarf: 0.9, tie: 0.85, gloves: 0.8, other_wearable: 0.6 } as Record<string, number>,
};
const NEUTRALS = new Set(["black", "white", "grey", "beige", "cream", "navy", "brown", "silver", "gold"]);
const SEASON_BIT: Record<string, number> = { spring: 1, summer: 2, autumn: 4, winter: 8 };
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const HEAD = new Set(["cap", "hat", "beanie"]);
export const BAG = new Set(["bag", "backpack"]);
export const NECK = new Set(["scarf", "necklace", "tie"]);

export function toAcc(r: RawAcc): Acc {
  const vec = new Float32Array(STYLE_KEYS.length); let norm = 0;
  STYLE_KEYS.forEach((k, i) => { const w = r.styles?.[k] ?? 0; vec[i] = w; norm += w * w; });
  norm = Math.sqrt(norm) || 1; for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  const main = r.colors?.[0] ?? "multicolor";
  return {
    id: r.id, store: r.store, type: r.type, genders: r.gender === "women" ? ["women"] : r.gender === "men" ? ["men"] : ["women", "men"], vec, main,
    accent: NEUTRALS.has(main) ? null : main, mask: (r.season ?? []).reduce((m, s) => m | (SEASON_BIT[s] ?? 0), 0) || 15,
    formality: r.formality ?? 0.3, statement: r.statement ?? 0.3, bold: r.boldness ?? 0.3, frontFlat: !!r.front_flat, beltShape: r.belt_shape ?? null,
  };
}

export interface OutfitCtx {
  gender: "women" | "men"; vec: Float32Array; mask: number; formality: number; accents: Set<string>; statements: number;
  warm: boolean; cold: boolean; tailored: boolean; hasBottom: boolean; full: boolean; outerTop: boolean;
}

/** Summary of an outfit (its 2-3 main pieces) for the accessory rules. */
export function outfitCtx(gender: "women" | "men", pieces: Piece[], names: string[]): OutfitCtx {
  const vec = new Float32Array(STYLE_KEYS.length);
  let mask = 15, fSum = 0, statements = 0;
  const accents = new Set<string>();
  for (const p of pieces) {
    for (let i = 0; i < vec.length; i++) vec[i] += p.vec[i];
    mask &= p.mask || 15; fSum += p.formality; if (p.statement >= ACC.statementMin) statements++;
    for (const a of p.accents) accents.add(a);
  }
  let norm = 0; for (const x of vec) norm += x * x; norm = Math.sqrt(norm) || 1; for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  const formality = fSum / Math.max(1, pieces.length);
  const summerOnly = pieces.some((x) => (x.mask & 2) !== 0 && (x.mask & 8) === 0), winterOnly = pieces.some((x) => (x.mask & 8) !== 0 && (x.mask & 2) === 0);
  const warm = pieces.some((x) => x.warm) || summerOnly || (mask & 12) === 0 && (mask & 2) !== 0;
  const cold = pieces.some((x) => x.cold) || winterOnly || (mask & 7) === 0 && (mask & 8) !== 0;
  const tailored = formality >= ACC.tailoredFormality || names.some((n) => /\b(blazer|suit|tuxedo|tailored|dress shirt|waistcoat)\b/i.test(n));
  const top = pieces.find((x) => x.slot === "top"), bottom = pieces.find((x) => x.slot === "bottom");
  return { gender, vec, mask, formality, accents, statements, warm, cold, tailored, hasBottom: !!bottom, outerTop: names.some((n) => /\b(coat|jacket|parka|blazer|overshirt|trench|puffer|anorak|bomber|cardigan|vest|gilet)\b/i.test(n)), full: pieces.some((x) => x.slot === "full_body") && !top };
}

/** Hard rules for a single accessory against an outfit; null = fine, string = the reason it is rejected. */
export function reject(a: Acc, o: OutfitCtx): string | null {
  if (!a.genders.includes(o.gender)) return "gender";
  if ((a.mask & o.mask) === 0) return "season";
  if (o.warm && (a.type === "beanie" || a.type === "scarf" || a.type === "gloves")) return "warm-outfit";
  if (o.cold && a.type === "sunglasses") return "cold-outfit";
  if (o.tailored && (HEAD.has(a.type) || a.type === "backpack")) return "tailored";
  if (a.type === "tie" && o.formality < 0.5) return "tie-informal";
  if (a.type === "belt" && !o.hasBottom && !o.full) return "belt-no-waist";
  if (o.statements > 0 && a.statement >= ACC.statementMin) return "second-statement";
  if (Math.abs(a.formality - o.formality) > ACC.formalityTol) return "formality";
  const sim = dot(a.vec, o.vec);
  if (sim < ACC.minStyleSim) return "style";
  if (a.accent && o.accents.size > 0 && !o.accents.has(a.accent)) return "second-accent";   // neutral outfit may take ONE accent, an accented outfit none
  return null;
}

/** Score 0..1 of a (rule-passing) accessory for an outfit. */
export function scoreAcc(a: Acc, o: OutfitCtx): number {
  const w = ACC.weights;
  const style = clamp01((dot(a.vec, o.vec) - ACC.minStyleSim) / (0.85 - ACC.minStyleSim));
  const colour = a.accent ? (o.accents.size === 0 ? 0.75 : 1) : 1;      // an accent on a neutral outfit is fine but not ideal; neutral accessories always match
  const formal = clamp01(1 - Math.abs(a.formality - o.formality) / ACC.formalityTol);
  const season = (a.mask & o.mask) === o.mask ? 1 : 0.8;
  return w.style * style + w.colour * colour + w.formal * formal + w.season * season + w.type * (ACC.typeBase[a.type] ?? 0.6);
}

/** Preferred placement kind and zone (the layout may demote inline -> side when the image or the space does not allow it). */
export function placementFor(a: Acc, o?: OutfitCtx): { placement: Placement; zone: string } {
  switch (a.type) {
    case "cap": case "hat": case "beanie": return { placement: "head", zone: "head" };
    case "sunglasses": return a.frontFlat ? { placement: "inline", zone: "glasses" } : { placement: "side", zone: "upper" };
    case "necklace": return a.frontFlat && !o?.outerTop ? { placement: "inline", zone: "neck" } : { placement: "side", zone: "mid" };
    case "belt": return a.frontFlat && a.beltShape === "straight_strip" ? { placement: "inline", zone: "seam" } : { placement: "side", zone: "hip" };
    case "watch": case "bracelet": return { placement: "side", zone: "sleeve" };
    case "scarf": case "gloves": case "tie": return { placement: "side", zone: "upper" };
    case "bag": case "backpack": return { placement: "side", zone: "hip" };
    default: return { placement: "side", zone: "mid" };
  }
}

export interface Usage { uses: Map<number, number>; recentIds: number[][]; recentStores: string[][] }

/**
 * Choose 0-3 accessories: one per type, at most one head item, one bag, one neck item, at most one statement piece in the whole outfit,
 * at most one accent colour. Greedy by score with rising thresholds (prefer 2). `usage` implements diversity across the feed order.
 */
export function chooseAccessories(o: OutfitCtx, cands: Acc[], usage: Usage): Pick[] {
  const scored: { a: Acc; s: number }[] = [];
  for (const a of cands) {
    if (reject(a, o)) continue;
    let s = scoreAcc(a, o);
    const u = usage.uses.get(a.id) ?? 0;
    s /= 1 + ACC.reusePenalty * u;
    if (usage.recentIds.some((ids) => ids.includes(a.id))) s *= ACC.recentPenalty;
    else if (usage.recentStores.some((st) => st.includes(a.store))) s *= 0.9;
    scored.push({ a, s });
  }
  scored.sort((x, y) => y.s - x.s);
  const picks: Pick[] = [];
  const types = new Set<string>(); let head = false, bag = false, neck = false, statement = o.statements > 0, accent: string | null = o.accents.size ? [...o.accents][0] : null;
  for (const { a, s } of scored) {
    if (picks.length >= 3) break;
    if (s < ACC.minScore[picks.length]) break;
    if (types.has(a.type)) continue;
    if (HEAD.has(a.type) && head) continue;
    if (BAG.has(a.type) && bag) continue;
    if (NECK.has(a.type) && neck) continue;
    if (a.statement >= ACC.statementMin && statement) continue;
    if (a.accent && accent && a.accent !== accent) continue;
    types.add(a.type); if (HEAD.has(a.type)) head = true; if (BAG.has(a.type)) bag = true; if (NECK.has(a.type)) neck = true;
    if (a.statement >= ACC.statementMin) statement = true; if (a.accent) accent = a.accent;
    picks.push({ acc: a, score: s, ...placementFor(a, o) });
  }
  return picks;
}
