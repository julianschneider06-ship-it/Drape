// Composer polish (behind ?feed=dynamic only; the shared scoreOutfit and the pool builder are untouched):
// soft streak rule + page reordering, tone-on-tone penalty, subcategory variety cap, own scoring for deliberate style breaks.
import type { Catalogue, CatPiece } from "./catalogue";
import { scoreOutfit, type Piece, type Scored } from "./score";

export const POLISH = {
  /** a run of the same style / store in the served order is allowed up to maxRun(share of the gender's catalogue): big groups 3, medium 2, small 1 (no immediate repeat) */
  runBySize: [{ share: 0.15, run: 3 }, { share: 0.04, run: 2 }, { share: 0, run: 1 }],
  tonePenalty: 0.88,                  // multiplier on the outfit score for top + bottom in the same saturated hue
  subCap: { window: 10, max: 2 },     // at most 2 of the same top group and 2 of the same bottom group within 10 outfits
  subCapMinPool: 12,                  // never filter a candidate list below this size (the cap gives way before the feed goes empty)
  contrastMinScore: 0.78,             // own minimum for style breaks (their style similarity is low by design)
  contrastMinGap: 0.3,                // formality gap between the two pieces of the pattern
  softRedraws: 2,                     // re-draws of an outfit whose style / store would extend a run beyond its limit (cheap, not counted as failures)
  partnerTries: 3,                    // partners tried (best first) before an attempt fails for lack of a completion
  wide: [1, 1.6, 2.5],                // candidate sample multiplier on the 1st, 2nd, later attempts of an outfit (widens where "no candidate" dominates)
};

const SATURATED = new Set(["blue", "green", "red", "pink", "yellow", "purple", "orange"]);
/** top + bottom in the same saturated hue (pink hoodie + pink sweatpants); denim blue and muted tones (olive, burgundy, beige ...) are fine */
export function toneOnTone(top: Piece & { name?: string }, bottom: Piece & { name?: string }): boolean {
  if (top.main !== bottom.main || !SATURATED.has(top.main)) return false;
  if (top.main === "blue" && /\b(denim|jeans?)\b/i.test(`${bottom.name ?? ""} ${bottom.sub}`)) return false;
  return true;
}
export const tonePenalty = (ps: Piece[]): number => {
  const t = ps.find((x) => x.slot === "top"), b = ps.find((x) => x.slot === "bottom");
  return t && b && toneOnTone(t, b) ? POLISH.tonePenalty : 1;
};

/** sub category group for the variety cap (hoodie + sweatshirt count as one, tees as one, sweatpants / joggers / track pants as one) */
export function subGroup(p: { slot: string; sub: string }): string {
  const s = p.sub.toLowerCase();
  if (/hoodie|sweatshirt/.test(s)) return "sweat top";
  if (/t-?shirt|^tee$|long ?sleeve|tank/.test(s)) return "tee";
  if (/sweatpant|jogger|track pant/.test(s)) return "sweat bottom";
  if (/trouser|^pants$|chino/.test(s)) return "trousers";
  return s || p.slot;
}

/** scoring of deliberate style breaks: the same terms as scoreOutfit, but a formality gap in the direction of the pattern is not punished */
export function scoreContrast(ps: Piece[]): Scored | null {
  const r = scoreOutfit(ps); if (!r) return null;
  const score = (0.34 * r.style + 0.22 * r.colour + 0.16 * 1 + 0.10 * r.season + 0.18 * r.balance) * r.pen;
  return { ...r, formal: 1, score };
}

const shareCache = new WeakMap<Catalogue, Map<string, number>>();
/** share of a style / store inside the catalogue of a gender (keys `${g}:style:x` and `${g}:store:x`) */
export function shareOf(cat: Catalogue, g: string, kind: "style" | "store", key: string): number {
  let m = shareCache.get(cat);
  if (!m) {
    m = new Map(); const tot = new Map<string, number>();
    for (const p of cat.pieces) for (const gg of p.genders) { for (const k of [`${gg}:style:${p.dom}`, `${gg}:store:${p.store}`]) m.set(k, (m.get(k) ?? 0) + 1); tot.set(gg, (tot.get(gg) ?? 0) + 1); }
    for (const [k, v] of m) m.set(k, v / (tot.get(k.split(":")[0]) ?? 1));
    shareCache.set(cat, m);
  }
  return m.get(`${g}:${kind}:${key}`) ?? 0;
}
export const maxRun = (share: number) => POLISH.runBySize.find((x) => share >= x.share)!.run;

/** reorder the page so that no style / store run exceeds its limit (given the tail of what was served before); never drops or adds an outfit */
export function reorderPage<T extends { style: string; store: string }>(items: T[], tailStyles: string[], tailStores: string[], cat: Catalogue, g: string): T[] {
  const left = items.slice(), out: T[] = [], styles = tailStyles.slice(-4), stores = tailStores.slice(-4);
  const run = (arr: string[], v: string) => { let n = 0; for (let i = arr.length - 1; i >= 0 && arr[i] === v; i--) n++; return n; };
  const bad = (o: T) => run(styles, o.style) >= maxRun(shareOf(cat, g, "style", o.style)) || run(stores, o.store) >= maxRun(shareOf(cat, g, "store", o.store));
  while (left.length) {
    let i = left.findIndex((o) => !bad(o)); if (i < 0) i = 0;
    const [o] = left.splice(i, 1); out.push(o); styles.push(o.style); stores.push(o.store);
  }
  return out;
}

export type { CatPiece };

const subShareCache = new WeakMap<Catalogue, Map<string, number>>();
/** share of a sub category group inside the gender's pieces of that slot */
export function subShare(cat: Catalogue, g: string, slot: string, group: string): number {
  let m = subShareCache.get(cat);
  if (!m) {
    m = new Map(); const tot = new Map<string, number>();
    for (const p of cat.pieces) { if (p.slot !== "top" && p.slot !== "bottom") continue; for (const gg of p.genders) { const k = `${gg}:${p.slot}`; tot.set(k, (tot.get(k) ?? 0) + 1); const kk = `${k}:${subGroup(p)}`; m.set(kk, (m.get(kk) ?? 0) + 1); } }
    for (const [k, v] of m) { const i = k.indexOf(":", k.indexOf(":") + 1); m.set(k, v / (tot.get(k.slice(0, i)) ?? 1)); }
    subShareCache.set(cat, m);
  }
  return m.get(`${g}:${slot}:${group}`) ?? 0;
}
/** allowed count of one group within the window: at least subCap.max, more for groups that really are big in the catalogue (men's trousers) */
export const subAllowed = (cat: Catalogue, g: string, slot: string, group: string) => Math.max(POLISH.subCap.max, Math.ceil(POLISH.subCap.window * subShare(cat, g, slot, group) * 1.25));

/** would adding `v` to the served order create a run longer than the limit of its group? */
export function runTooLong(order: string[], v: string, share: number): boolean {
  let n = 0; for (let i = order.length - 1; i >= 0 && order[i] === v; i--) n++;
  return n >= maxRun(share);
}
