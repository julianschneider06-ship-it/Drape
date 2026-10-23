// Selection logic of Wishlist > Generate Outfits (pure, no I/O): which liked product anchors each outfit, which pieces count as filler.
// Randomness is seeded, so the same liked list + seed always gives the same sequence (stable while scrolling back and forth).
import { WISHLIST_REUSE_RATE } from "@/config/wishlist";
import { makeRnd, type Rnd } from "@/outfits/pool-shared";
import type { FeedOutfit } from "@/lib/types";
import type { Catalogue } from "@/outfits/catalogue";

export interface AnchorState { uses: Map<number, number>; last: number | null }

/**
 * The liked piece that anchors the next outfit. Never the previous anchor (unless there is only one liked piece). With chance `rate` it is a piece that was
 * already used (the less often used, the more likely); otherwise a piece not used yet. When every piece was used, it cycles through the least used ones.
 */
export function nextAnchor(ids: number[], st: AnchorState, rnd: Rnd, rate = WISHLIST_REUSE_RATE): number | null {
  if (!ids.length) return null;
  const pool = ids.length > 1 ? ids.filter((i) => i !== st.last) : ids;
  const used = pool.filter((i) => (st.uses.get(i) ?? 0) > 0), fresh = pool.filter((i) => !st.uses.get(i));
  const from = fresh.length && used.length ? (rnd() < rate ? used : fresh) : fresh.length ? fresh : used;
  const w = from.map((i) => 1 / (1 + (st.uses.get(i) ?? 0)) ** 2);
  let r = rnd() * w.reduce((a, b) => a + b, 0), pick = from[from.length - 1];
  for (let k = 0; k < from.length; k++) { r -= w[k]; if (r <= 0) { pick = from[k]; break; } }
  st.uses.set(pick, (st.uses.get(pick) ?? 0) + 1); st.last = pick;
  return pick;
}

/** the anchors of outfits 0..n-1 (deterministic for the same ids and seed) */
export function anchorSequence(ids: number[], seed: number, n: number, rate = WISHLIST_REUSE_RATE): number[] {
  const st: AnchorState = { uses: new Map(), last: null }, rnd = makeRnd((seed >>> 0) ^ 0x5bd1e995), out: number[] = [];
  for (let i = 0; i < n; i++) { const a = nextAnchor(ids, st, rnd, rate); if (a === null) break; out.push(a); }
  return out;
}

/** ids to keep out of the next outfit: the previous outfit's pieces, but a liked piece only when the user has another liked piece of its kind (`likedPerKind` >= 2) */
export function avoidIds(prev: number[], liked: Set<number>, kindOf: (id: number) => string, likedPerKind: Map<string, number>): Set<number> {
  return new Set(prev.filter((id) => !liked.has(id) || (likedPerKind.get(kindOf(id)) ?? 0) >= 2));
}

/** id of the piece shown in a canvas slot (top / bottom / shoes / full / acc1..acc8) */
export function pieceIdAt(o: FeedOutfit, slot: string): number | undefined {
  if (slot === "top" || slot === "full") return o.top.id;
  if (slot === "bottom") return o.bottom?.id;
  if (slot === "shoes") return o.shoes.id;
  const n = /^acc(\d+)$/.exec(slot);
  return n ? o.accessories?.find((a, i) => (a.slot_no ?? i + 1) === +n[1])?.card.id : undefined;
}

/** filler = a piece that is not one of the outfit's liked products: greyed out, not tappable, not likeable */
export const isFiller = (o: FeedOutfit, slot: string): boolean => { const id = pieceIdAt(o, slot); return id === undefined || !o.wl?.includes(id); };

/** Generate Outfits display, one rule for every piece (also ones liked long ago): liked right now = colour, not liked = grey. Unliking greys a piece in place, liking brings the colour back; the outfit itself never changes. */
export const isGrey = (o: FeedOutfit, slot: string, liked: ReadonlySet<number>): boolean => { const id = pieceIdAt(o, slot); return !(id !== undefined && liked.has(id)); };
/** What a gesture on a piece does: a greyed piece only reacts to a double tap (like); a single tap does nothing. Normal pieces keep tap = open, double tap = like. */
export const greyGesture = (a: "tap" | "like" | null | undefined, grey: boolean): "open" | "like" | "none" => a === "like" ? "like" : a === "tap" && !grey ? "open" : "none";

/** the liked ids that count for one direction: pieces (and accessories) of that direction that are in the catalogue with a usable card; anything else is ignored */
export function usableLiked(cat: Catalogue, g: "women" | "men", ids: number[]): { mains: number[]; accs: number[] } {
  const u = [...new Set(ids)];
  return {
    mains: u.filter((id) => { const p = cat.byId.get(id); return !!p?.card && p.genders.includes(g); }),
    accs: u.filter((id) => { const a = cat.accById.get(id); return !!a?.card && a.genders.includes(g); }),
  };
}
