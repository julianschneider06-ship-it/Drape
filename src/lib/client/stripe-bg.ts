"use client";
import { useSyncExternalStore } from "react";
import { effectiveStripe } from "@/lib/stripe-bg";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** Stripe background on/off: ?stripe=0|1 link wins, else the Profile choice (device only, default off). Re-renders when the switch flips. */
const stripeOn = (): boolean => effectiveStripe(new URLSearchParams(window.location.search).get("stripe"), getPrefs().stripe);
export const useStripeBackground = (): boolean => useSyncExternalStore(subscribePrefs, stripeOn, () => false);
