"use client";
import { useSyncExternalStore } from "react";
import { effectiveBg } from "@/lib/shop-pref";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** Drape background on/off: ?bg=0|1 link wins, else the Profile choice (device only, default on). Re-renders when the switch flips. */
const bgOn = (): boolean => effectiveBg(new URLSearchParams(window.location.search).get("bg"), getPrefs().bg);
export const useDrapeBackground = (): boolean => useSyncExternalStore(subscribePrefs, bgOn, () => true);
