"use client";
import { useSyncExternalStore } from "react";
import { effectiveMini } from "@/lib/mannequin";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** Outfit preview on/off: ?mini=0|1 link wins, else the Profile choice (device only, default on). Re-renders when the switch flips. */
const miniOn = (): boolean => effectiveMini(new URLSearchParams(window.location.search).get("mini"), getPrefs().mini);
export const useMiniPreview = (): boolean => useSyncExternalStore(subscribePrefs, miniOn, () => true);
