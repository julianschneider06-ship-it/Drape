// Shop preferences, pure (shared by browser and server): wire format, validation, weights.
// Wire format: "slug:L,slug:M" (L = less, M = more). Normal is the default and never sent. Unknown ids are dropped on the server, size is capped.
import { SHOP_PREF, SHOP_PREF_LIMITS, type ShopLevel } from "../config/shop-pref";

export type { ShopLevel };
export type ShopPrefs = Record<string, "less" | "more">;

/** compact string for the feed request ("" = nothing changed) */
export function encodeShopPrefs(shops: ShopPrefs): string {
  const parts: string[] = [];
  for (const id of Object.keys(shops).sort()) {
    const l = shops[id];
    if ((l === "less" || l === "more") && SHOP_PREF_LIMITS.idPattern.test(id)) parts.push(`${id}:${l === "less" ? "L" : "M"}`);
    if (parts.length >= SHOP_PREF_LIMITS.maxEntries) break;
  }
  return parts.join(",");
}

/** Server-side parse: anything that is not a short well-formed string gives an empty result; bad entries and (when `known` is given) unknown shops are skipped; at most maxEntries are kept. */
export function parseShopPrefs(raw: unknown, known?: { has(id: string): boolean }): Map<string, "less" | "more"> {
  const out = new Map<string, "less" | "more">();
  if (typeof raw !== "string" || !raw || raw.length > SHOP_PREF_LIMITS.maxChars) return out;
  for (const part of raw.split(",")) {
    const i = part.lastIndexOf(":");
    if (i < 1) continue;
    const id = part.slice(0, i), c = part.slice(i + 1);
    if ((c !== "L" && c !== "M") || !SHOP_PREF_LIMITS.idPattern.test(id) || (known && !known.has(id))) continue;
    out.set(id, c === "L" ? "less" : "more");
    if (out.size >= SHOP_PREF_LIMITS.maxEntries) break;
  }
  return out;
}

export const levelWeight = (l: ShopLevel | undefined): number => (l === "less" ? SHOP_PREF.less : l === "more" ? SHOP_PREF.more : 1);

/** shop id -> selection weight multiplier (only shops that are not Normal) */
export function shopWeights(prefs: ReadonlyMap<string, "less" | "more">): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, l] of prefs) m.set(id, levelWeight(l));
  return m;
}

/** Effective sale marker. A link parameter (?sale=on|off) wins (testing); otherwise the global app setting AND the user's choice: global off always beats local on. */
export const effectiveSale = (link: string | null, globalOn: boolean, localOn: boolean): boolean => (link === "on" ? true : link === "off" ? false : globalOn && localOn);

export interface ProfilePrefs { v: 1; sale: boolean; shops: ShopPrefs }
export const DEFAULT_PREFS: ProfilePrefs = { v: 1, sale: true, shops: {} };

/** Clean whatever was read from storage: wrong version, garbage, wrong types -> defaults for that part. */
export function cleanPrefs(raw: unknown): ProfilePrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return DEFAULT_PREFS;
  const shops: ShopPrefs = {};
  if (r.shops && typeof r.shops === "object") {
    let n = 0;
    for (const [id, l] of Object.entries(r.shops as Record<string, unknown>)) {
      if ((l === "less" || l === "more") && SHOP_PREF_LIMITS.idPattern.test(id)) { shops[id] = l; if (++n >= SHOP_PREF_LIMITS.maxEntries) break; }
    }
  }
  return { v: 1, sale: typeof r.sale === "boolean" ? r.sale : true, shops };
}

/** read / write with the storage passed in, every access guarded (blocked storage = defaults, nothing thrown) */
export function readPrefs(storage: Pick<Storage, "getItem"> | null | undefined, key: string): ProfilePrefs {
  try { const s = storage?.getItem(key); return s ? cleanPrefs(JSON.parse(s)) : DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
}
export function writePrefs(storage: Pick<Storage, "setItem"> | null | undefined, key: string, p: ProfilePrefs): boolean {
  try { storage?.setItem(key, JSON.stringify(p)); return !!storage; } catch { return false; }
}

/** readable shop name when the source list has none (client fallback; the API sends the proper display name) */
export const tidySlug = (slug: string) => slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
