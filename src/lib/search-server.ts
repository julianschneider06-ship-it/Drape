// Server side of the Search tab. Read-only: everything comes from the in-memory catalogue snapshot (the same one the feed uses), no database read per request,
// no write, no paid call, nothing stored. Search matches PIECES (family / season / extra of the searched piece only); each result is an outfit composed around that
// piece by the normal composer's rules (src/outfits/compose-around.ts). The user's own gender comes first, then the other gender, with no cap. The list is worked through on demand: one small page of outfits per request.
import "server-only";
import { getCat, toFeedOutfits } from "@/lib/dynamic";
import { rowsOf } from "@/lib/search-index";
import { buildFacets, searchRank, uniqueRows, type Facets, type Gender, type Relaxed, type SearchQuery, type SearchRow } from "@/lib/search";
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
const both = async () => { const [women, men] = await Promise.all([getCat("women"), getCat("men")]); return { women, men }; };
const joint = new WeakMap<Catalogue, { men: Catalogue; facets: Facets }>();   // option counts over both genders, one entry per product

/** option counts of matching products (both genders together, a unisex piece counted once): the same list the search delivers */
export async function searchFacets(g: Gender): Promise<Facets> {
  const c = await both(), hit = joint.get(c.women);
  if (hit && hit.men === c.men) return hit.facets;
  const facets = buildFacets(uniqueRows([...rowsFor(c.women, "women"), ...rowsFor(c.men, "men")], g));
  joint.set(c.women, { men: c.men, facets });
  return facets;
}

export interface SearchSignals { taste?: string | null; seed?: string[] }
export interface SearchPage { items: FeedOutfit[]; sids: number[]; relaxed: Relaxed; exact: number; total: number; next: number; skipped: number }

/** how well a piece suits the device: style picks as the starting prior plus the taste learned from likes (same pure functions as the hybrid feed); null = no signals */
function fitFor(c: { women: Catalogue; men: Catalogue }, sig: SearchSignals | undefined): ((r: SearchRow) => number) | undefined {
  if (!sig || (!sig.taste && !sig.seed?.length)) return undefined;
  const taste = decodeTaste(sig.taste) ?? newTaste(), t = withPrior(taste, sig.seed ?? []) ?? taste;
  if (t.n < 5 && !t.prior) return undefined;
  return (r) => {
    const cat = c[r.g];
    if (r.item === "accessory") { const a = cat.accById.get(r.id); return a ? styleMatch(t, a.vec) : 0.5; }
    const p = cat.byId.get(r.id); return p ? tasteMatch(t, p) : 0.5;
  };
}

/**
 * One page of a search: the ordered list of ALL matching products is ranked in memory (cheap), then outfits are composed around the products from `from`
 * on until `limit` outfits exist (a product no outfit can be built around is skipped and counted). `next` is the position to continue from.
 */
export async function searchPage(g: Gender, q: SearchQuery, from: number, limit = SEARCH_PAGE, sig?: SearchSignals): Promise<SearchPage> {
  const c = await both();
  const { cands, relaxed, exact } = searchRank([...rowsFor(c.women, "women"), ...rowsFor(c.men, "men")], q, g, undefined, fitFor(c, sig));
  const st = newAround(), made: { o: NonNullable<ReturnType<typeof composeAround>>; g: Gender; id: number }[] = [];
  let i = Math.max(0, from), skipped = 0;
  for (; i < cands.length && made.length < limit; i++) {
    const k = cands[i];
    const o = composeAround(c[k.g], k.g, k.id, q.item === "accessory", st) ?? composeAround(c[k.g], k.g, k.id, q.item === "accessory", st, 1);   // second try with another seed before a product is given up
    if (o) made.push({ o, g: k.g, id: k.id }); else skipped++;
  }
  const out = await Promise.all(made.map(async ({ o, g: og, id }, n) => {
    const [fo] = await toFeedOutfits(c[og], og, [o], [{}], from + n);
    return fo ? { fo: { ...fo, ...(og !== g ? { og } : {}) } as FeedOutfit, id } : null;
  }));
  const ok = out.filter((x): x is { fo: FeedOutfit; id: number } => !!x);
  return { items: ok.map((x) => x.fo), sids: ok.map((x) => x.id), relaxed, exact, total: cands.length, next: i, skipped: skipped + (made.length - ok.length) };
}
