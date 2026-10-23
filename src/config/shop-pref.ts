// Shop preferences (Profile > Shops). Stored on the device only; the client sends them as a compact string with every composed feed page.
/** Multiplier on a piece's selection weight in the live composer by the shop it comes from. Normal = 1. Never 0 (no hard filter). */
export const SHOP_PREF = { less: 0.4, more: 2.6 } as const;
export type ShopLevel = "less" | "normal" | "more";
/** Wire format limits (server validates and caps): "slug:L,slug:M" - L = less, M = more; normal is never sent. */
export const SHOP_PREF_LIMITS = { maxEntries: 150, maxChars: 3000, idPattern: /^[a-z0-9][a-z0-9_-]{0,39}$/ } as const;
/** Local storage of the Profile page (one JSON value with a version field). */
export const PROFILE_KEY = "drape.profile";
export const PROFILE_VERSION = 1;
/** Shops list: how many search matches are shown at once. */
export const SHOP_LIST_MAX = 60;
