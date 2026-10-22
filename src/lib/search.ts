// Search logic (pure, shared by server and browser): filter pool outfits by style FAMILY (+ optional season / extra), rank by match quality,
// relax the optional filters when few exact matches exist, count what each option would return, and decide which pieces are greyed out.
import { FAMILY_KEYS, familyOf, type StyleFamily } from "@/config/style-families";
import { EXTRAS, SEARCH_MAX_RESULTS, SEARCH_MIN_EXACT, SEASONS, type SearchExtra, type SearchItem, type SearchSeason } from "@/config/search";
import type { OutfitTags } from "@/outfits/tags";

/** what search needs to know about one pool outfit (computed from its tags, see rowFromTags) */
export interface SearchRow { id: number; fam: StyleFamily; se: SearchSeason | "all"; sf: number; ex: SearchExtra[]; str: number; sc: number; acc: boolean; full: boolean }
export interface SearchQuery { family: StyleFamily; item: SearchItem; season?: SearchSeason | null; extra?: SearchExtra | null }
export type Relaxed = "none" | "extra" | "season";

/** the extras an outfit has: the same attributes the icons use, but each one separately (an outfit can have several) */
export function extrasOf(t: OutfitTags): SearchExtra[] {
  const out: SearchExtra[] = [];
  if (t.rain) out.push("rain");
  if (t.occasion === "evening" || t.occasion === "office" || t.occasion === "resort") out.push(t.occasion);
  if (t.contrast) out.push("contrast");
  if (t.boldness === "bold") out.push("bold");
  if (t.palette.kind === "tonal" || t.palette.kind === "colourful") out.push(t.palette.kind);
  if (t.formality_level === "formal") out.push("formal");
  return out;
}
export function rowFromTags(id: number, t: OutfitTags, o: { score: number; acc: boolean; full: boolean }): SearchRow | null {
  const fam = familyOf(t.style_primary);
  return fam ? { id, fam, se: t.season_primary, sf: t.season_fit, ex: extrasOf(t), str: t.style_strength, sc: o.score, acc: o.acc, full: o.full } : null;
}

/** can this outfit be searched for this item? A one-piece outfit has no separate top or bottom. */
export const hasItem = (r: Pick<SearchRow, "acc" | "full">, item: SearchItem) => (item === "accessory" ? r.acc : item === "shoes" ? true : !r.full);

/** safe parse of link / API parameters: only the 5 families, never an individual style */
export const parseFamily = (v: unknown): StyleFamily | null => ((FAMILY_KEYS as string[]).includes(v as string) ? (v as StyleFamily) : null);
export const parseItem = (v: unknown): SearchItem | null => (v === "accessory" || v === "shoes" || v === "top" || v === "bottom" ? v : null);
export const parseSeason = (v: unknown): SearchSeason | null => (SEASONS.some((s) => s.id === v) ? (v as SearchSeason) : null);
export const parseExtra = (v: unknown): SearchExtra | null => (EXTRAS.some((e) => e.id === v) ? (v as SearchExtra) : null);

export function searchRank(rows: SearchRow[], q: SearchQuery, max = SEARCH_MAX_RESULTS, minExact = SEARCH_MIN_EXACT): { ids: number[]; relaxed: Relaxed; exact: number } {
  const base = rows.filter((r) => r.fam === q.family && hasItem(r, q.item));
  let top = 0; for (const r of base) if (r.sc > top) top = r.sc;
  const seasonOk = (r: SearchRow) => !q.season || r.se === q.season, extraOk = (r: SearchRow) => !q.extra || r.ex.includes(q.extra);
  const tierOf = (r: SearchRow) => (seasonOk(r) && extraOk(r) ? 0 : seasonOk(r) ? 1 : 2);   // 0 exact, 1 extra dropped, 2 season (and extra) dropped
  const quality = (r: SearchRow) => 0.45 * r.str + 0.25 * (q.season && r.se === q.season ? r.sf : 0) + 0.2 * (top > 0 ? r.sc / top : 0) + 0.1 * (q.extra && r.ex.includes(q.extra) ? 1 : 0);
  const exact = base.filter((r) => tierOf(r) === 0);
  let limit = 0, relaxed: Relaxed = "none";
  if (exact.length < minExact) {
    if (q.extra) { limit = 1; relaxed = "extra"; }
    if (q.season && (limit === 0 || base.filter((r) => tierOf(r) <= 1).length < minExact)) { limit = 2; relaxed = "season"; }
    if (!q.season && !q.extra) limit = 0;
  }
  const pool = base.filter((r) => tierOf(r) <= limit).sort((a, b) => tierOf(a) - tierOf(b) || quality(b) - quality(a) || a.id - b.id).slice(0, max);
  if (pool.every((r) => tierOf(r) === 0)) relaxed = "none";
  return { ids: pool.map((r) => r.id), relaxed, exact: exact.length };
}

/** option counts: key "family|season|extra|item", "*" = not chosen. One pass over the rows; at most about 1500 keys. */
export type Facets = Record<string, number>;
export const facetKey = (f: string, s: string, e: string, i: string) => `${f}|${s}|${e}|${i}`;
export function buildFacets(rows: SearchRow[]): Facets {
  const out: Facets = {};
  const items: SearchItem[] = ["accessory", "shoes", "top", "bottom"];
  for (const r of rows) {
    const is = ["*", ...items.filter((i) => hasItem(r, i))], fs = [r.fam, "*"], ss = r.se === "all" ? ["*"] : [r.se, "*"], es = ["*", ...r.ex];
    for (const f of fs) for (const s of ss) for (const e of es) for (const i of is) { const k = facetKey(f, s, e, i); out[k] = (out[k] ?? 0) + 1; }
  }
  return out;
}
/** how many outfits match these (partly unchosen) options; used to offer only options that have results */
export const facetCount = (f: Facets, sel: { family?: string | null; season?: string | null; extra?: string | null; item?: string | null }) =>
  f[facetKey(sel.family ?? "*", sel.season ?? "*", sel.extra ?? "*", sel.item ?? "*")] ?? 0;

/** greying: the searched item stays normal, everything else of the outfit is secondary. slot = a layout slot name (top, bottom, shoes, full, acc1 ...). */
export function isSearchedSlot(slot: string, item: SearchItem): boolean {
  if (item === "accessory") return slot.startsWith("acc");
  return slot === item;
}
