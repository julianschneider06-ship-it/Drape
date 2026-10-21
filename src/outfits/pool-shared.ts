// Pure parts of the pool builder, shared by the pool job (scripts/build-outfits.ts) and the dynamic composer (src/outfits/compose.ts).
// Moved here unchanged (same results for the same seed); the only change is that the random generator is passed in.
import { outfitStyle, scoreOutfit, type Piece } from "./score";

export const MIN_SCORE_DEFAULT = 0.84;
export const CAP = { top: 4, bottom: 7, shoes: 6, full_body: 5 } as const; // max outfits per product (variety)
export const K_PAIR = 10; // best bottoms per top (and tops per bottom) before choosing shoes
export const SHOES_PER_PAIR = 3;

export type Rnd = () => number;
/** deterministic PRNG (LCG) so a re-run of the same data gives the same pool */
export function makeRnd(seed: number): Rnd { let s = seed; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export interface Cand { key: string; ids: number[]; pieces: Piece[]; kind: "three" | "full"; score: number; style: string }

/** Best `n` shoes for a pair (or a full-body piece), by outfit score with a little noise. */
export function bestShoes(pair: Piece[], S: Piece[], n: number, rnd: Rnd): Piece[] {
  const scored: [number, Piece][] = [];
  for (const s of S) { const sc = scoreOutfit([...pair, s]); if (sc) scored.push([sc.score + (rnd() - 0.5) * 0.04, s]); }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, n).map((x) => x[1]);
}

/** Cheap pair score (top + bottom) used to pre-select partners before the shoes are chosen. */
export function pairScore(a: Piece, b: Piece, rnd: Rnd): number {
  let d = 0; for (let i = 0; i < a.vec.length; i++) d += a.vec[i] * b.vec[i];
  const sc = scoreOutfit([a, b]);
  return sc ? sc.score * 0.5 + d * 0.5 + (rnd() - 0.5) * 0.06 : -1;
}

/** All candidate outfits of one gender (three-piece anchored on every top and every bottom, full-body + shoes). */
export function candidatesFor(all: Piece[], g: "women" | "men", rnd: Rnd, minScore: number): Cand[] {
  const by = (slot: string) => all.filter((p) => p.slot === slot && p.genders.includes(g));
  const T = by("top"), B = by("bottom"), S = by("shoes"), F = by("full_body");
  const map = new Map<string, Cand>();
  const add = (pieces: Piece[], kind: "three" | "full") => {
    const sc = scoreOutfit(pieces);
    if (!sc || sc.score < minScore) return;
    const key = pieces.map((p) => p.id).join("|");
    const prev = map.get(key);
    if (!prev || prev.score < sc.score) map.set(key, { key, ids: pieces.map((p) => p.id), pieces, kind, score: sc.score, style: outfitStyle(pieces) });
  };
  for (const t of T) {
    const best = B.map((b) => [pairScore(t, b, rnd), b] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, K_PAIR);
    for (const [, b] of best) for (const s of bestShoes([t, b], S, SHOES_PER_PAIR, rnd)) add([t, b, s], "three");
  }
  for (const b of B) {
    const best = T.map((t) => [pairScore(t, b, rnd), t] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b2) => b2[0] - a[0]).slice(0, K_PAIR);
    for (const [, t] of best) for (const s of bestShoes([t, b], S, SHOES_PER_PAIR, rnd)) add([t, b, s], "three");
  }
  for (const f of F) for (const s of bestShoes([f], S, 6, rnd)) add([f, s], "full");
  return [...map.values()];
}

/** Pick by score with per-product caps. */
export function select(cands: Cand[]): Cand[] {
  const used = new Map<number, number>();
  const out: Cand[] = [];
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    if (c.pieces.some((p) => (used.get(p.id) ?? 0) >= CAP[p.slot])) continue;
    for (const p of c.pieces) used.set(p.id, (used.get(p.id) ?? 0) + 1);
    out.push(c);
  }
  return out;
}

/** Order for the feed: weighted shuffle (high scores earlier, still varied) + no repeats of a product / style / store in a row. */
export function order(sel: Cand[], rnd: Rnd): Cand[] {
  const keyed = sel.map((c) => ({ c, k: Math.pow(rnd(), 1 / Math.pow(c.score, 6)) })).sort((a, b) => b.k - a.k).map((x) => x.c);
  const usedIdx = new Array(keyed.length).fill(false);
  const out: Cand[] = [];
  const recentProducts: number[][] = [], recentStyles: string[] = [], recentStores: string[] = [];
  let first = 0;
  while (out.length < keyed.length) {
    while (usedIdx[first]) first++;
    const ok = (c: Cand, level: number) => {
      const ids = new Set(recentProducts.flat());
      if (c.ids.some((id) => ids.has(id))) return false;
      if (level >= 1) return true;
      if (recentStyles.slice(-2).every((s) => s === c.style) && recentStyles.length >= 2) return false;
      if (recentStores.slice(-1)[0] === c.pieces[0].store) return false;
      return true;
    };
    let pick = -1;
    for (const level of [0, 1, 2]) {
      for (let j = first, seen = 0; j < keyed.length && seen < 80; j++) {
        if (usedIdx[j]) continue;
        seen++;
        if (level === 2 || ok(keyed[j], level)) { pick = j; break; }
      }
      if (pick >= 0) break;
    }
    usedIdx[pick] = true;
    const c = keyed[pick];
    out.push(c);
    recentProducts.push(c.ids); if (recentProducts.length > 12) recentProducts.shift();
    recentStyles.push(c.style); if (recentStyles.length > 3) recentStyles.shift();
    recentStores.push(c.pieces[0].store); if (recentStores.length > 2) recentStores.shift();
  }
  return out;
}
