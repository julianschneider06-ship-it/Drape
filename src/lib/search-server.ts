// Server side of the Search tab. Read-only: everything comes from the in-memory catalogue snapshot (the same one the feed uses), no database read per request,
// no write, no paid call, nothing stored. Search matches PIECES (family / season / extra of the searched piece only); each result is an outfit composed around that
// piece by the normal composer's rules (src/outfits/compose-around.ts). Only the chosen direction (men / women) is searched, with no cap. The list is worked through on demand: one small page of outfits per request.
import "server-only";
import { getCat, toFeedOutfits } from "@/lib/dynamic";
import { rowsOf } from "@/lib/search-index";
import { buildFacets, searchRank, type Facets, type Gender, type Relaxed, type SearchQuery, type SearchRow } from "@/lib/search";
import { SEARCH_PAGE } from "@/config/search";
import { composeAround, newAround } from "@/outfits/compose-around";
import { decodeTaste } from "@/outfits/taste-codec";
import { newTaste, styleMatch, tasteMatch, withPrior } from "@/outfits/taste";
import type { Catalogue } from "@/outfits/catalogue";
import type { FeedOutfit } from "@/lib/types";

const indexes = new WeakMap<Catalogue, SearchRow[]>();   // one index per catalogue version (a refreshed snapshot is a new Catalogue object)
const rowsFor = (cat: Catalogue, g: Gender): SearchRow[] => {
  let rows = indexes.get(cat);
  if (!rows) { rows = rowsOf(cat, g); indexes.set(cat, rows); }
  return rows;
};
const facetsOf = new WeakMap<Catalogue, Facets>();   // option counts per catalogue version

/** option counts of matching products of one direction (a unisex piece counted once): the same list the search delivers */
export async function searchFacets(g: Gender): Promise<Facets> {
  const cat = await getCat(g);
  let f = facetsOf.get(cat);
  if (!f) { f = buildFacets(rowsFor(cat, g)); facetsOf.set(cat, f); }
  return f;
}

export interface SearchSignals { taste?: string | null; seed?: string[] }
export interface SearchPage { items: FeedOutfit[]; sids: number[]; relaxed: Relaxed; exact: number; total: number; next: number; skipped: number }

/** how well a piece suits the device: style picks as the starting prior plus the taste learned from likes (same pure functions as the hybrid feed); null = no signals */
function fitFor(cat: Catalogue, sig: SearchSignals | undefined): ((r: SearchRow) => number) | undefined {
  if (!sig || (!sig.taste && !sig.seed?.length)) return undefined;
  const taste = decodeTaste(sig.taste) ?? newTaste(), t = withPrior(taste, sig.seed ?? []) ?? taste;
  if (t.n < 5 && !t.prior) return undefined;
  return (r) => {
    if (r.item === "accessory") { const a = cat.accById.get(r.id); return a ? styleMatch(t, a.vec) : 0.5; }
    const p = cat.byId.get(r.id); return p ? tasteMatch(t, p) : 0.5;
  };
}

/**
 * One page of a search: the ordered list of ALL matching products is ranked in memory (cheap), then outfits are composed around the products from `from`
 * on until `limit` outfits exist (a product no outfit can be built around is skipped and counted). `next` is the position to continue from.
 */
export async function searchPage(g: Gender, q: SearchQuery, from: number, limit = SEARCH_PAGE, sig?: SearchSignals): Promise<SearchPage> {
  const cat = await getCat(g);
  const { cands, relaxed, exact } = searchRank(rowsFor(cat, g), q, g, undefined, fitFor(cat, sig));
  const st = newAround(), made: { o: NonNullable<ReturnType<typeof composeAround>>; id: number }[] = [];
  let i = Math.max(0, from), skipped = 0;
  for (; i < cands.length && made.length < limit; i++) {
    const k = cands[i];
    const o = composeAround(cat, g, k.id, q.item === "accessory", st) ?? composeAround(cat, g, k.id, q.item === "accessory", st, 1);   // second try with another seed before a product is given up
    if (o) made.push({ o, id: k.id }); else skipped++;
  }
  const out = await Promise.all(made.map(async ({ o, id }, n) => {
    const [fo] = await toFeedOutfits(cat, g, [o], [{}], from + n);
    const sc = q.item === "accessory" ? cat.accById.get(id)?.main : cat.byId.get(id)?.colors[0];   // searched piece's main colour
    return fo ? { fo: { ...fo, sc: sc ?? null } as FeedOutfit, id } : null;
  }));
  const ok = out.filter((x): x is { fo: FeedOutfit; id: number } => !!x);
  return { items: ok.map((x) => x.fo), sids: ok.map((x) => x.id), relaxed, exact, total: cands.length, next: i, skipped: skipped + (made.length - ok.length) };
}
