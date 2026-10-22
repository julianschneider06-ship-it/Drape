// Search logic (pure, shared by server and browser). Search works on PIECES: only the searched piece must match the filters (style family, season, extra);
// the rest of the outfit is composed freely around it (src/outfits/compose-around.ts). This file ranks the matching pieces (own gender first, then the other
// gender), relaxes the optional filters when few exact matches exist, counts what each option would return and decides which pieces are greyed out.
import { FAMILY_KEYS, type StyleFamily } from "@/config/style-families";
import { EXTRAS, SEARCH_MIN_EXACT, SEARCH_STORE_CAP, SEASONS, type SearchExtra, type SearchItem, type SearchSeason } from "@/config/search";

export type Gender = "women" | "men";
/** one searchable piece: a top, bottom, shoe or accessory of one gender's catalogue (see rowsOf in search-index.ts). mask = season bits (1 spring, 2 summer, 4 autumn, 8 winter) */
export interface SearchRow { id: number; g: Gender; item: SearchItem; fam: StyleFamily; mask: number; ex: SearchExtra[]; q: number; store: string }
export interface SearchQuery { family: StyleFamily; item: SearchItem; season?: SearchSeason | null; extra?: SearchExtra | null }
export type Relaxed = "none" | "extra" | "season";
export interface Cand { id: number; g: Gender }

export const SEASON_BIT: Record<SearchSeason, number> = { spring: 1, summer: 2, autumn: 4, winter: 8 };
const popcount = (m: number) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));
export const seasonsOf = (mask: number): SearchSeason[] => SEASONS.map((s) => s.id).filter((s) => mask & SEASON_BIT[s]);

/** safe parse of link / API parameters: only the 5 families, never an individual style */
export const parseFamily = (v: unknown): StyleFamily | null => ((FAMILY_KEYS as string[]).includes(v as string) ? (v as StyleFamily) : null);
export const parseItem = (v: unknown): SearchItem | null => (v === "accessory" || v === "shoes" || v === "top" || v === "bottom" ? v : null);
export const parseSeason = (v: unknown): SearchSeason | null => (SEASONS.some((s) => s.id === v) ? (v as SearchSeason) : null);
export const parseExtra = (v: unknown): SearchExtra | null => (EXTRAS.some((e) => e.id === v) ? (v as SearchExtra) : null);

/** within one tier: at most `cap` pieces per shop first, the rest after them (keeps one shop from filling the page) */
function diversify(list: SearchRow[], cap: number): SearchRow[] {
  const n = new Map<string, number>(), first: SearchRow[] = [], rest: SearchRow[] = [];
  for (const r of list) { const c = n.get(r.store) ?? 0; if (c < cap) { first.push(r); n.set(r.store, c + 1); } else rest.push(r); }
  return [...first, ...rest];
}

/** one row per product (a unisex piece is in both catalogues): the own gender's row wins */
export function uniqueRows(rows: SearchRow[], own: Gender): SearchRow[] {
  const by = new Map<number, SearchRow>();
  for (const r of rows) { const o = by.get(r.id); if (!o || (r.g === own && o.g !== own)) by.set(r.id, r); }
  return [...by.values()];
}

/** which optional filters are dropped for a given number of exact matches: none, the extra, or the season too (see searchRank) */
function relaxLimit(exact: number, countTier1: () => number, q: Pick<SearchQuery, "season" | "extra">, minExact: number): 0 | 1 | 2 {
  let limit: 0 | 1 | 2 = 0;
  if (exact < minExact) {
    if (q.extra) limit = 1;
    if (q.season && (limit === 0 || countTier1() < minExact)) limit = 2;
  }
  return limit;
}

/**
 * ALL matching products in display order (no cap): own gender first, then the other gender, each ranked exact matches first. Each product appears once
 * (a unisex piece under the own gender). Relaxation (extra first, then season) looks at both genders together. `fit` (0..1, 0.5 = neutral) is the device's
 * taste for a piece (style picks as prior, likes); without signals it is neutral and the order is the stable default (quality, then id).
 * The caller composes the outfit around each candidate on demand, in this order.
 */
export function searchRank(rowsIn: SearchRow[], q: SearchQuery, own: Gender, minExact = SEARCH_MIN_EXACT, fit?: (r: SearchRow) => number): { cands: Cand[]; relaxed: Relaxed; exact: number } {
  const base = uniqueRows(rowsIn, own).filter((r) => r.fam === q.family && r.item === q.item);
  const sb = q.season ? SEASON_BIT[q.season] : 0;
  const seasonOk = (r: SearchRow) => !q.season || (r.mask & sb) !== 0, extraOk = (r: SearchRow) => !q.extra || r.ex.includes(q.extra);
  const tierOf = (r: SearchRow) => (seasonOk(r) && extraOk(r) ? 0 : seasonOk(r) ? 1 : 2);   // 0 exact, 1 extra dropped, 2 season (and extra) dropped
  const quality = (r: SearchRow) => 0.6 * r.q + (q.season && seasonOk(r) ? 0.25 * (1 - (popcount(r.mask) - 1) / 3) : 0) + (q.extra && extraOk(r) ? 0.15 : 0) + (fit ? 0.4 * (fit(r) - 0.5) : 0);
  const exact = base.filter((r) => tierOf(r) === 0).length;
  const limit = relaxLimit(exact, () => base.filter((r) => tierOf(r) <= 1).length, q, minExact);
  let relaxed: Relaxed = limit === 0 ? "none" : limit === 1 ? "extra" : "season";
  const ranked = (g: Gender) => {
    const mine = base.filter((r) => r.g === g && tierOf(r) <= limit);
    return [0, 1, 2].flatMap((t) => diversify(mine.filter((r) => tierOf(r) === t).sort((a, b) => quality(b) - quality(a) || a.id - b.id), SEARCH_STORE_CAP));
  };
  const other: Gender = own === "women" ? "men" : "women";
  const a = ranked(own), b = ranked(other);
  const cands = [...a, ...b].map((r) => ({ id: r.id, g: r.g }));
  if (!cands.length || [...a, ...b].every((r) => tierOf(r) === 0)) relaxed = "none";
  return { cands, relaxed, exact };
}

/** N of the "Search (N)" button: how many products a search with this selection delivers, from the option counts alone (same relaxation rule as searchRank) */
export function matchCount(f: Facets, sel: { item: string; family: string; season?: string | null; extra?: string | null }, minExact = SEARCH_MIN_EXACT): number {
  const s = sel.season ?? "*", e = sel.extra ?? "*", c = (se: string, ex: string) => facetCount(f, { item: sel.item, family: sel.family, season: se, extra: ex });
  const limit = relaxLimit(c(s, e), () => c(s, "*"), { season: sel.season, extra: sel.extra } as SearchQuery, minExact);
  return c(limit >= 2 ? "*" : s, limit >= 1 ? "*" : e);
}

/** the sale marker (outline + SALE label) is drawn on the searched piece only; the greyed-out pieces of a Search result never show it */
export const showSale = (onSale: boolean, dimmed: boolean) => onSale && !dimmed;

/** option counts of matching PIECES (both genders together): key "item|family|season|extra", "*" = not chosen. At most about 2000 keys. */
export type Facets = Record<string, number>;
export const facetKey = (i: string, f: string, s: string, e: string) => `${i}|${f}|${s}|${e}`;
export function buildFacets(rows: SearchRow[]): Facets {
  const out: Facets = {};
  for (const r of rows) {
    const ss = ["*", ...seasonsOf(r.mask)], es = ["*", ...r.ex];
    for (const i of ["*", r.item]) for (const f of ["*", r.fam]) for (const s of ss) for (const e of es) { const k = facetKey(i, f, s, e); out[k] = (out[k] ?? 0) + 1; }
  }
  return out;
}
/** how many pieces match these (partly unchosen) options; used to offer only options that have results */
export const facetCount = (f: Facets, sel: { item?: string | null; family?: string | null; season?: string | null; extra?: string | null }) =>
  f[facetKey(sel.item ?? "*", sel.family ?? "*", sel.season ?? "*", sel.extra ?? "*")] ?? 0;
export const sumFacets = (a: Facets, b: Facets): Facets => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = (o[k] ?? 0) + v; return o; };

/** greying: the searched item stays normal, everything else of the outfit is secondary. slot = a layout slot name (top, bottom, shoes, full, acc1 ...). */
export function isSearchedSlot(slot: string, item: SearchItem): boolean {
  if (item === "accessory") return slot === "acc1";   // the composer puts the searched accessory first
  return slot === item;
}
