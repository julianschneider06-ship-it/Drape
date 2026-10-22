// Search logic (pure, shared by server and browser). Search works on PIECES: only the searched piece must match the filters (style family, season, extra);
// the rest of the outfit is composed freely around it (src/outfits/compose-around.ts). This file ranks the matching pieces (own gender first, then the other
// gender), relaxes the optional filters when few exact matches exist, counts what each option would return and decides which pieces are greyed out.
import { FAMILY_KEYS, type StyleFamily } from "@/config/style-families";
import { EXTRAS, SEARCH_MAX_RESULTS, SEARCH_MIN_EXACT, SEARCH_STORE_CAP, SEASONS, type SearchExtra, type SearchItem, type SearchSeason } from "@/config/search";

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

/**
 * Matching pieces in display order: own gender first, then the other gender, each ranked exact matches first. Relaxation (extra first, then season) looks at the
 * matches of both genders together. A piece that is in both catalogues (unisex) appears once, under the own gender. Returns up to `max * overflow` candidates
 * per gender: the caller composes an outfit around each one and stops at `max` outfits in total (a piece that cannot be composed is skipped).
 */
export function searchRank(rows: SearchRow[], q: SearchQuery, own: Gender, max = SEARCH_MAX_RESULTS, minExact = SEARCH_MIN_EXACT, overflow = 2): { cands: Cand[]; relaxed: Relaxed; exact: number } {
  const base = rows.filter((r) => r.fam === q.family && r.item === q.item);
  const sb = q.season ? SEASON_BIT[q.season] : 0;
  const seasonOk = (r: SearchRow) => !q.season || (r.mask & sb) !== 0, extraOk = (r: SearchRow) => !q.extra || r.ex.includes(q.extra);
  const tierOf = (r: SearchRow) => (seasonOk(r) && extraOk(r) ? 0 : seasonOk(r) ? 1 : 2);   // 0 exact, 1 extra dropped, 2 season (and extra) dropped
  const quality = (r: SearchRow) => 0.6 * r.q + (q.season && seasonOk(r) ? 0.25 * (1 - (popcount(r.mask) - 1) / 3) : 0) + (q.extra && extraOk(r) ? 0.15 : 0);
  const exact = base.filter((r) => tierOf(r) === 0).length;
  let limit = 0, relaxed: Relaxed = "none";
  if (exact < minExact) {
    if (q.extra) { limit = 1; relaxed = "extra"; }
    if (q.season && (limit === 0 || base.filter((r) => tierOf(r) <= 1).length < minExact)) { limit = 2; relaxed = "season"; }
  }
  const ranked = (g: Gender) => {
    const mine = base.filter((r) => r.g === g && tierOf(r) <= limit);
    return [0, 1, 2].flatMap((t) => diversify(mine.filter((r) => tierOf(r) === t).sort((a, b) => quality(b) - quality(a) || a.id - b.id), SEARCH_STORE_CAP));
  };
  const other: Gender = own === "women" ? "men" : "women";
  const a = ranked(own), seen = new Set(a.map((r) => r.id)), b = ranked(other).filter((r) => !seen.has(r.id));
  const cands = [...a.slice(0, max * overflow), ...b.slice(0, max * overflow)].map((r) => ({ id: r.id, g: r.g }));
  if (!cands.length || [...a, ...b].every((r) => tierOf(r) === 0)) relaxed = "none";
  return { cands, relaxed, exact };
}

/** walk the candidates in order and keep what could be built, up to `max` results in total (own gender first because the candidates are in that order) */
export function collect<T>(cands: Cand[], make: (c: Cand) => T | null, max = SEARCH_MAX_RESULTS): T[] {
  const out: T[] = [], used = new Set<number>();
  for (const c of cands) {
    if (out.length >= max) break;
    if (used.has(c.id)) continue;
    const r = make(c); if (r) { out.push(r); used.add(c.id); }
  }
  return out;
}

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
