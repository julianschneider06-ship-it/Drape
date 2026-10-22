// Server side of the Search tab. Read-only: everything comes from the in-memory catalogue snapshot (the same one the feed uses), no database read per request,
// no write, no paid call, nothing stored. Search matches PIECES (family / season / extra of the searched piece only); each result is an outfit composed around that
// piece by the normal composer's rules (src/outfits/compose-around.ts). The user's own gender comes first, then the other gender, up to SEARCH_MAX_RESULTS in total.
import "server-only";
import { getCat, toFeedOutfits } from "@/lib/dynamic";
import { rowsOf } from "@/lib/search-index";
import { buildFacets, collect, searchRank, sumFacets, type Facets, type Gender, type Relaxed, type SearchQuery, type SearchRow } from "@/lib/search";
import { composeAround, newAround } from "@/outfits/compose-around";
import type { Catalogue } from "@/outfits/catalogue";
import type { FeedOutfit } from "@/lib/types";

interface Index { rows: SearchRow[]; facets: Facets }
const indexes = new WeakMap<Catalogue, Index>();   // one index per catalogue version (a refreshed snapshot is a new Catalogue object)
const indexOf = (cat: Catalogue, g: Gender): Index => {
  let ix = indexes.get(cat);
  if (!ix) { const rows = rowsOf(cat, g); ix = { rows, facets: buildFacets(rows) }; indexes.set(cat, ix); }
  return ix;
};
const both = async () => { const [women, men] = await Promise.all([getCat("women"), getCat("men")]); return { women, men }; };

/** option counts of matching pieces, both genders together */
export async function searchFacets(_g: Gender): Promise<Facets> {
  const c = await both();
  return sumFacets(indexOf(c.women, "women").facets, indexOf(c.men, "men").facets);
}

export async function searchOutfits(g: Gender, q: SearchQuery): Promise<{ items: FeedOutfit[]; relaxed: Relaxed; exact: number; own: number }> {
  const c = await both();
  const { cands, relaxed, exact } = searchRank([...indexOf(c.women, "women").rows, ...indexOf(c.men, "men").rows], q, g);
  const st = newAround();
  const made = collect(cands, (k) => { const o = composeAround(c[k.g], k.g, k.id, q.item === "accessory", st); return o ? { o, g: k.g } : null; });
  const items = (await Promise.all(made.map(async ({ o, g: og }, i) => {
    const [fo] = await toFeedOutfits(c[og], og, [o], [{}], i);
    return fo ? ({ ...fo, ...(og !== g ? { og } : {}) } as FeedOutfit) : null;
  }))).filter((x): x is FeedOutfit => !!x);
  return { items, relaxed, exact, own: items.filter((x) => !x.og).length };
}
