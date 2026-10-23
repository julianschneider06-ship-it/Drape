// Reserved outfits for thin styles. The pool builder labels an outfit with the style of the highest summed weight (outfitStyle), so styles that
// other styles always outweigh (grunge, y2k, preppy, ...) get almost no outfits although enough fitting pieces exist. This step builds a few
// extra outfits per thin style around pieces that carry the style, and labels them with it. It never changes outfitStyle or existing labels.
// Pure (no I/O): used by scripts/build-outfits.ts as part of the normal rebuild; same input + seed = same output (idempotent).
import { bestShoes, K_PAIR, pairScore, SHOES_PER_PAIR, type Rnd } from "./pool-shared";
import { scoreOutfit, type Piece } from "./score";

export const RESERVED = {
  thinBelow: 150,      // a style with fewer pool outfits (per gender) than this is thin
  minOutfits: 10,      // fewer good outfits than this = the style gets none (e.g. coquette for men): not worth showing in the picker
  perStyle: 80,        // never more reserved outfits than this per style and gender
  anchorMin: 0.5,      // the anchor piece carries the style at this weight
  partnerMin: 0.4,     // at least MIN_PIECES pieces (anchor included) carry the style at this weight
  minPieces: 2,
  pieceCap: 4,         // a piece appears in at most this many reserved outfits of the same style
  maxShared: 1,        // two reserved outfits of a style share at most this many pieces (no near-duplicates)
  partnerBonus: 0.3,   // ranking of partners: pair score + bonus x style weight
} as const;

export interface ReservedCand { key: string; ids: number[]; pieces: Piece[]; kind: "three" | "full"; score: number; style: string }

/** style weight of a piece (raw classification weight; Piece.vec is normalised and cannot be used for the thresholds) */
export type StyleWeight = (p: Piece) => number;

/** styles with fewer than `below` outfits for a gender (counts = outfits of the normal selection per style key) */
export function thinStyles(counts: Record<string, number>, allStyles: readonly string[], below = RESERVED.thinBelow): string[] {
  return allStyles.filter((s) => (counts[s] ?? 0) < below);
}

/** the rule: >= minPieces pieces carry the style at partnerMin, and the anchor carries it at anchorMin */
export function carriesStyle(pieces: Piece[], anchor: Piece, w: StyleWeight): boolean {
  return w(anchor) >= RESERVED.anchorMin && pieces.filter((p) => w(p) >= RESERVED.partnerMin).length >= RESERVED.minPieces;
}

/**
 * Reserved outfits of one style and gender. `taken` = keys (ids joined by "|") of outfits the normal selection already has (not repeated).
 * Same compatibility, colour and season rules as the normal builder (scoreOutfit, minScore). Greedy by score with a per-piece cap and a
 * near-duplicate rule; fewer than `perStyle` is fine (quality beats count).
 */
export function reservedFor(all: Piece[], g: "women" | "men", style: string, w: StyleWeight, rnd: Rnd, minScore: number, taken: ReadonlySet<string>, limit: number = RESERVED.perStyle): ReservedCand[] {
  const by = (slot: string) => all.filter((p) => p.slot === slot && p.genders.includes(g));
  const T = by("top"), B = by("bottom"), S = by("shoes"), F = by("full_body");
  const map = new Map<string, ReservedCand>();
  const add = (pieces: Piece[], anchor: Piece, kind: "three" | "full") => {
    if (!carriesStyle(pieces, anchor, w)) return;
    const key = pieces.map((p) => p.id).join("|");
    if (taken.has(key)) return;
    const sc = scoreOutfit(pieces);
    if (!sc || sc.score < minScore) return;
    const prev = map.get(key);
    if (!prev || prev.score < sc.score) map.set(key, { key, ids: pieces.map((p) => p.id), pieces, kind, score: sc.score, style });
  };
  const rank = (a: Piece, b: Piece) => pairScore(a, b, rnd) + RESERVED.partnerBonus * w(b);
  const styled = (S2: Piece[]) => [...S2].sort((x, y) => w(y) - w(x));
  const anchors = (L: Piece[]) => L.filter((p) => w(p) >= RESERVED.anchorMin);
  const shoesFor = (pair: Piece[], n: number) => {
    // best shoes by outfit score, plus the best styled shoes, so the style rule can be met through the shoes too
    const out = new Map<number, Piece>();
    for (const s of bestShoes(pair, S, n, rnd)) out.set(s.id, s);
    for (const s of bestShoes(pair, styled(S).filter((x) => w(x) >= RESERVED.partnerMin).slice(0, 40), 1, rnd)) out.set(s.id, s);
    return [...out.values()];
  };
  const gen = () => {
    for (const t of anchors(T)) {
      const best = B.map((b) => [rank(t, b), b] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, K_PAIR);
      for (const [, b] of best) for (const s of shoesFor([t, b], SHOES_PER_PAIR)) add([t, b, s], t, "three");
    }
    for (const b of anchors(B)) {
      const best = T.map((t) => [rank(b, t), t] as [number, Piece]).filter((x) => x[0] > 0).sort((a, b2) => b2[0] - a[0]).slice(0, K_PAIR);
      for (const [, t] of best) for (const s of shoesFor([t, b], SHOES_PER_PAIR)) add([t, b, s], b, "three");
    }
    for (const f of anchors(F)) for (const s of shoesFor([f], 6)) add([f, s], f, "full");
    return [...map.values()];
  };
  const got = pick(gen(), limit, w);
  return got.length >= RESERVED.minOutfits ? got : [];
}

function pick(cands: ReservedCand[], limit: number, w: StyleWeight): ReservedCand[] {
  // rank: outfit score plus how strongly the pieces carry the style
  const val = (c: ReservedCand) => c.score + 0.05 * c.pieces.reduce((a, p) => a + Math.min(1, w(p)), 0);
  cands.sort((a, b) => val(b) - val(a) || (a.key < b.key ? -1 : 1));
  const used = new Map<number, number>();
  const out: ReservedCand[] = [];
  for (const c of cands) {
    if (out.length >= limit) break;
    if (c.pieces.some((p) => (used.get(p.id) ?? 0) >= RESERVED.pieceCap)) continue;
    if (out.some((o) => o.ids.filter((id) => c.ids.includes(id)).length > RESERVED.maxShared)) continue;
    for (const p of c.pieces) used.set(p.id, (used.get(p.id) ?? 0) + 1);
    out.push(c);
  }
  return out;
}
