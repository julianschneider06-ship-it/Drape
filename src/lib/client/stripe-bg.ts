"use client";
import type { StripeMode } from "@/lib/shop-pref";
import { useEffectiveStripe } from "@/lib/client/season-decor";

/** Stripe background mode: ?stripe=0|1|simple link wins (1 = colorful), else the Profile choice (device only, default off); Pictures mode forces Off (Pictures wins). */
export const useStripeMode = (): StripeMode => useEffectiveStripe();
