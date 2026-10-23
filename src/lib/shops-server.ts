// Shops that are live in the feed, from the in-memory catalogue snapshots (pure, so it can be tested). A shop counts when its source is active and it has at least one
// feed-ready piece or accessory (that is what the snapshot holds). Display name from the source list; unknown slugs get a tidied-up slug.
import { SOURCES } from "@/ingest/sources";
import { tidySlug } from "@/lib/shop-pref";
import type { Catalogue } from "@/outfits/catalogue";

/** n = products (pieces + accessories, each once), g = how many of them each direction's catalogue holds (unisex ones count in both) */
export interface ShopInfo { id: string; name: string; n: number; g: { women: number; men: number } }
const NAMES = new Map(SOURCES.map((s) => [s.slug, s]));

export function shopList(cats: Catalogue[], sources: Map<string, { name: string; active?: boolean }> = NAMES): ShopInfo[] {
  const ids = new Map<string, Set<number>>();   // a unisex piece sits in both gender catalogues: count each product once
  const per = new Map<string, { women: Set<number>; men: Set<number> }>();
  for (const cat of cats) {
    const add = (store: string, id: number, genders: readonly string[]) => {
      (ids.get(store) ?? ids.set(store, new Set()).get(store)!).add(id);
      const p = per.get(store) ?? per.set(store, { women: new Set(), men: new Set() }).get(store)!;
      if (genders.includes("women")) p.women.add(id); if (genders.includes("men")) p.men.add(id);
    };
    for (const p of cat.pieces) add(p.store, p.id, p.genders);
    for (const a of cat.accs) add(a.store, a.id, a.genders);
  }
  const out: ShopInfo[] = [];
  for (const [id, set] of ids) {
    const src = sources.get(id);
    if (src && src.active === false) continue;
    if (set.size < 1) continue;
    out.push({ id, name: src?.name ?? tidySlug(id), n: set.size, g: { women: per.get(id)!.women.size, men: per.get(id)!.men.size } });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
