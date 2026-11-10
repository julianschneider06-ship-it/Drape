"use client";
import { useSyncExternalStore } from "react";
import type { StripeMode } from "@/lib/shop-pref";

/** What the page background currently shows, so the glass bars can draw a zoomed copy of it (lens). Published by BackgroundPicture / StripeBackground (no per-frame work, only on change). */
export type LensSource =
  | { kind: "picture"; src: string; veil: { color: "white" | "black"; opacity: number } }
  | { kind: "stripe"; mode: StripeMode; colors: readonly string[]; seed: string };
export type LensOwner = "feed" | "wishlist";

const sources = new Map<LensOwner, LensSource>(), listeners = new Set<() => void>();
let snap: LensSource | null = null;
const recompute = () => { const n = sources.get("wishlist") ?? sources.get("feed") ?? null; if (n !== snap) { snap = n; listeners.forEach((l) => l()); } };   // Wishlist overlay (mounted only while open) wins over the feed under it
export function publishLens(owner: LensOwner, s: LensSource | null) { if (s) sources.set(owner, s); else sources.delete(owner); recompute(); }
export const useLensSource = (): LensSource | null => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => snap, () => null);
