// Pure helpers of the Profile > Shops list (client side filter, grouping of the user's changed shops).
import { tidySlug, type ShopPrefs } from "./shop-pref";

export interface ShopRowInfo { id: string; name: string; n?: number }

/** instant, case-insensitive filter by display name (also matches the id); an empty query matches nothing here (the page then shows "Your shops") */
export function filterShops(shops: ShopRowInfo[], query: string, max = Infinity): ShopRowInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return shops.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, max);
}

/** the shops the user changed, grouped More first, then Less, each alphabetical. `live` (when loaded) hides shops that are no longer in the feed. */
export function yourShops(prefs: ShopPrefs, live: ShopRowInfo[] | null): { more: ShopRowInfo[]; less: ShopRowInfo[] } {
  const byId = live ? new Map(live.map((s) => [s.id, s])) : null;
  const out = { more: [] as ShopRowInfo[], less: [] as ShopRowInfo[] };
  for (const [id, level] of Object.entries(prefs)) {
    if (byId && !byId.has(id)) continue;
    (level === "more" ? out.more : out.less).push(byId?.get(id) ?? { id, name: tidySlug(id) });
  }
  out.more.sort((a, b) => a.name.localeCompare(b.name)); out.less.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
