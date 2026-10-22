"use client";
import { useSyncExternalStore } from "react";
import { REDUCED_MOTION_QUERY } from "@/config/motion";

/** True when the user asked the OS for less motion. Safe on the server (false). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

const subscribe = (cb: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** Reacts to the OS setting; one shared helper for every animation. */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
