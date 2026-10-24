"use client";
// Device storage of My Outfits (localStorage, guarded: a blocked storage just means the outfits last until the page closes).
import { MY_OUTFITS_KEY } from "@/config/my-outfits";
import { parseStore, serializeStore, type Store } from "@/lib/my-outfits";

const ls = (): Storage | null => { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } };
let mem: Store | null = null;
export function loadStore(): Store {
  if (mem) return mem;
  let raw: string | null = null;
  try { raw = ls()?.getItem(MY_OUTFITS_KEY) ?? null; } catch { /* blocked */ }
  return (mem = parseStore(raw));
}
export function writeStore(s: Store) {
  mem = s;
  try { ls()?.setItem(MY_OUTFITS_KEY, serializeStore(s)); } catch { /* blocked: kept in memory only */ }
}
