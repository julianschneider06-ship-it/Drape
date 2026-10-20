// Outfit scoring: simple, explainable rules on the v2 attributes. Pure functions (no I/O), used by the pool builder.
import { STYLE_KEYS } from "../classify/styles";

export type Slot = "top" | "bottom" | "shoes" | "full_body";
export interface RawPiece {
  id: number; store: string; slot: Slot; gender: string | null; sub: string | null;
  styles: Record<string, number>; colors: string[]; pattern: string; material?: string | null; silhouette: string; fit: string;
  formality: number; boldness: number; statement: number; outer: boolean; season: string[];
}
export interface Piece {
  id: number; store: string; slot: Slot; sub: string; genders: ("women" | "men")[];
  vec: Float32Array; dom: string; main: string; accents: Set<string>; mask: number; volume: number; patterned: boolean;
  formality: number; statement: number; looseOk: boolean; outer: boolean;
  warm: boolean; cold: boolean; // warm-weather only (shorts, sandals) / cold-weather only (coats, wool, boots)
}

const NEUTRALS = new Set(["black", "white", "grey", "beige", "cream", "navy", "brown", "silver"]);
const SEASON_BIT: Record<string, number> = { spring: 1, summer: 2, autumn: 4, winter: 8 };
const FIT_VOL: Record<string, number> = { slim: -1, regular: 0, loose: 0.6, oversized: 1 };
const SIL_VOL: Record<string, number> = { oversized: 0.5, boxy: 0.3, relaxed: 0.3, flared: 0.3, slim: -0.3, tapered: -0.2, a_line: 0.2 };
// Items that are not outfit pieces for the feed (underwear, swim, sleepwear, house slippers).
const EXCLUDED = /\b(bra|bralette|bikini|swimsuit|swim|brief|briefs|boxer|boxers|underwear|lingerie|thong|slippers?|socks?|pajamas?|pyjamas?|robe|nightgown|nightdress)\b/i;

export const ALL_GENDERS: ("women" | "men")[] = ["women", "men"];

export function toPiece(r: RawPiece): Piece | null {
  if (EXCLUDED.test(r.sub ?? "")) return null;
  const vec = new Float32Array(STYLE_KEYS.length);
  let norm = 0, best = 0, dom = STYLE_KEYS[0];
  STYLE_KEYS.forEach((k, i) => { const w = r.styles?.[k] ?? 0; vec[i] = w; norm += w * w; if (w > best) { best = w; dom = k; } });
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  const genders = r.gender === "women" ? ["women"] : r.gender === "men" ? ["men"] : ALL_GENDERS;
  const main = r.colors?.[0] ?? "multicolor";
  const accents = new Set((r.colors ?? []).slice(0, 1).filter((c) => !NEUTRALS.has(c)));
  const mask = (r.season ?? []).reduce((m, s) => m | (SEASON_BIT[s] ?? 0), 0);
  const volume = Math.max(-1.5, Math.min(1.5, (FIT_VOL[r.fit] ?? 0) + (SIL_VOL[r.silhouette] ?? 0)));
  const sw = r.styles ?? {};
  return {
    id: r.id, store: r.store, slot: r.slot, sub: r.sub ?? "", genders: genders as Piece["genders"], vec, dom, main, accents, mask, volume,
    patterned: !["solid", undefined, null].includes(r.pattern as string),
    formality: r.formality ?? 0.3, statement: r.statement ?? 0.3,
    looseOk: Math.max(sw.streetwear ?? 0, sw.skater ?? 0, sw.athleisure ?? 0, sw.techwear ?? 0) >= 0.5, outer: !!r.outer,
    warm: /\b(shorts?|skort|sandals?|flip|slides?|tank|romper|playsuit)\b/i.test(r.sub ?? ""),
    cold: !!r.outer && /\b(coat|parka|puffer|down|fleece|anorak|shearling|overcoat|trench)\b/i.test(`${r.sub ?? ""} ${r.material ?? ""}`) ||
      ["fleece", "down_padded"].includes(r.material ?? "") || /\b(boots?|chelsea|loafer boots)\b/i.test(r.sub ?? "") && r.slot === "shoes",
  };
}

const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const popcount = (m: number) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const STATEMENT_MIN = 0.7; // a "statement piece"

export interface Scored { score: number; style: number; colour: number; formal: number; season: number; balance: number; pen: number }

/** Score a set of pieces (2 for full_body + shoes, 3 for top + bottom + shoes). null = hard reject. */
export function scoreOutfit(p: Piece[]): Scored | null {
  // hard rules: shared season, at most one statement piece
  let mask = 15, statements = 0;
  for (const x of p) { mask &= x.mask || 15; if (x.statement >= STATEMENT_MIN) statements++; }
  if (mask === 0 || statements > 1) return null;
  // weather mismatch: warm-only piece (shorts, sandals) next to a cold-only piece (coat, fleece, boots)
  const warm = p.some((x) => x.warm), cold = p.some((x) => x.cold);
  const summerOnly = p.some((x) => (x.mask & 2) !== 0 && (x.mask & 8) === 0), winterOnly = p.some((x) => (x.mask & 8) !== 0 && (x.mask & 2) === 0);
  if ((warm && cold) || (summerOnly && winterOnly)) return null;

  let sim = 0, pairs = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { sim += dot(p[i].vec, p[j].vec); pairs++; }
  const style = sim / pairs;

  // colour harmony: neutral base + at most one accent hue
  const accent = new Set<string>();
  for (const x of p) for (const a of x.accents) accent.add(a);
  const colour = accent.size === 0 ? 1 : accent.size === 1 ? 0.9 : accent.size === 2 ? 0.45 : 0.2;
  const colourPen = accent.size <= 1 ? 1 : accent.size === 2 ? 0.7 : 0.45; // extra multiplicative penalty: neutral base + max ONE accent

  let fMin = 1, fMax = 0;
  for (const x of p) { fMin = Math.min(fMin, x.formality); fMax = Math.max(fMax, x.formality); }
  const formal = clamp01(1 - (fMax - fMin) / 0.55);

  const seasonScore = popcount(mask) >= 3 ? 1 : popcount(mask) === 2 ? 0.9 : 0.7;

  // silhouette balance (top + bottom): no oversized x oversized unless streetwear-like
  let balance = 1;
  const top = p.find((x) => x.slot === "top"), bottom = p.find((x) => x.slot === "bottom");
  if (top && bottom) {
    const v = top.volume + bottom.volume;
    if (v > 1.4 && !(top.looseOk || bottom.looseOk)) balance = 1 - Math.min(0.6, (v - 1.4) * 0.5);
    else if (v < -1.8) balance = 0.9;
  }
  const patterned = p.filter((x) => x.patterned).length;
  const pen = (patterned >= 2 ? 0.45 : 1) * colourPen * (statements === 1 ? 1.04 : 0.97);

  const score = (0.34 * style + 0.22 * colour + 0.16 * formal + 0.10 * seasonScore + 0.18 * balance) * pen;
  return { score, style, colour, formal, season: seasonScore, balance, pen };
}

/** Dominant style of an outfit (argmax of summed style vectors). */
export function outfitStyle(p: Piece[]): string {
  const sum = new Float32Array(STYLE_KEYS.length);
  for (const x of p) for (let i = 0; i < sum.length; i++) sum[i] += x.vec[i];
  let bi = 0; for (let i = 1; i < sum.length; i++) if (sum[i] > sum[bi]) bi = i;
  return STYLE_KEYS[bi];
}
