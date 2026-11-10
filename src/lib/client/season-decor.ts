"use client";
import { useSyncExternalStore } from "react";
import { BG_MANIFEST } from "@/config/background-images";
import { resolveModes } from "@/lib/background-images";
import { parseStripeLink } from "@/lib/stripe-bg";
import type { SeasonMode, StripeMode } from "@/lib/shop-pref";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** The modes that really apply (links win over the Profile choice; Pictures + empty manifest = Sprites; Pictures + Stripe = Pictures wins). Re-renders when a choice changes. */
const modes = () => { const q = new URLSearchParams(window.location.search), p = getPrefs(); return resolveModes({ seasonLink: q.get("season"), stripeLink: parseStripeLink(q.get("stripe")), local: { season: p.season, stripe: p.stripe }, imageCount: BG_MANIFEST.length }); };
export const useSeasonMode = (): SeasonMode => useSyncExternalStore(subscribePrefs, () => modes().season, () => "sprites");
export const useEffectiveStripe = (): StripeMode => useSyncExternalStore(subscribePrefs, () => modes().stripe, () => "off");
export const useModeNote = (): string => useSyncExternalStore(subscribePrefs, () => modes().note ?? "", () => "");
/** sprites are drawn only in mode "sprites" */
export const useSeasonDecor = (): boolean => useSeasonMode() === "sprites";
