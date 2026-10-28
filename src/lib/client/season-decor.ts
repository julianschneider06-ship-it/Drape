"use client";
import { useSyncExternalStore } from "react";
import { effectiveSeason } from "@/lib/season-decor";
import { getPrefs, subscribePrefs } from "@/lib/client/profile-store";

/** Seasonal decoration on/off: ?season=0|1 link wins, else the Profile choice (device only, default on). Re-renders when the switch flips. */
const seasonOn = (): boolean => effectiveSeason(new URLSearchParams(window.location.search).get("season"), getPrefs().season);
export const useSeasonDecor = (): boolean => useSyncExternalStore(subscribePrefs, seasonOn, () => true);
