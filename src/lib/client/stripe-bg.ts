"use client";
import { useSyncExternalStore } from "react";
import { effectiveStripe } from "@/lib/stripe-bg";
import type { StripeMode } from "@/lib/shop-pref";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** Stripe background mode: ?stripe=0|1|simple link wins (1 = colorful), else the Profile choice (device only, default off). Re-renders when the choice changes. */
const stripeMode = (): StripeMode => effectiveStripe(new URLSearchParams(window.location.search).get("stripe"), getPrefs().stripe);
export const useStripeMode = (): StripeMode => useSyncExternalStore(subscribePrefs, stripeMode, () => "off");
