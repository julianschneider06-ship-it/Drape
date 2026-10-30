"use client";
// Client store of the Profile page (device only, no server): sale marker choice + shop levels. In memory with subscribers (so the feed re-renders when the
// choice changes) and persisted to localStorage; every storage access is guarded, a blocked storage just means the choice lasts until the page closes.
import { useSyncExternalStore } from "react";
import { PROFILE_KEY } from "@/config/shop-pref";
import { DEFAULT_PREFS, encodeShopPrefs, readPrefs, writePrefs, type ProfilePrefs, type ShopLevel, type StripeMode } from "@/lib/shop-pref";

const ls = (): Storage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
let prefs: ProfilePrefs | null = null;
const subs = new Set<() => void>();
export const getPrefs = (): ProfilePrefs => (prefs ??= readPrefs(ls(), PROFILE_KEY));
const commit = (p: ProfilePrefs) => { prefs = p; writePrefs(ls(), PROFILE_KEY, p); subs.forEach((f) => f()); };
export const setSaleLocal = (on: boolean) => commit({ ...getPrefs(), sale: on });
export const setBgLocal = (on: boolean) => commit({ ...getPrefs(), bg: on });
export const setSeasonLocal = (on: boolean) => commit({ ...getPrefs(), season: on });
export const setMiniLocal = (on: boolean) => commit({ ...getPrefs(), mini: on });
export const setStripeLocal = (mode: StripeMode) => commit({ ...getPrefs(), stripe: mode });
export function setShopLevel(id: string, level: ShopLevel) {
  const shops = { ...getPrefs().shops };
  if (level === "normal") delete shops[id]; else shops[id] = level;
  commit({ ...getPrefs(), shops });
}
/** compact string sent with composed feed pages ("" = no preference) */
export const shopPrefParam = () => encodeShopPrefs(getPrefs().shops);
export const hasShopPrefs = () => Object.keys(getPrefs().shops).length > 0;
export const subscribePrefs = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const usePrefs = (): ProfilePrefs => useSyncExternalStore(subscribePrefs, getPrefs, () => DEFAULT_PREFS);
