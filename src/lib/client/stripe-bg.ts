"use client";
import type { StripeMode } from "@/lib/shop-pref";
import { useSyncExternalStore } from "react";
import { effectiveGlassLook, type GlassLook } from "@/lib/stripe-bg";
import { useEffectiveStripe, useSeasonMode } from "@/lib/client/season-decor";

/** Stripe background mode: ?stripe=0|1|simple link wins (1 = colorful), else the Profile choice (device only, default off); Pictures mode forces Off (Pictures wins). */
export const useStripeMode = (): StripeMode => useEffectiveStripe();

/** Look of the glass header / tab bar: the Stripe mode, or (Pictures mode, Stripe is Off then) the grey "simple" glass so the picture shows through; "off" = normal white bars. */
export const useGlassMode = (): StripeMode => { const s = useEffectiveStripe(), pictures = useSeasonMode() === "pictures"; return s !== "off" ? s : pictures ? "simple" : "off"; };

/** Glass look: ?glass=frosted|liquid (link only, default liquid). */
export const useGlassLook = (): GlassLook => useSyncExternalStore(() => () => {}, () => effectiveGlassLook(new URLSearchParams(window.location.search).get("glass")), () => effectiveGlassLook(null));
