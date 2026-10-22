"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { animate } from "motion/react";
import { MENU, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { layerFade } from "@/lib/menu-motion";

/** Shows / hides a panel that stays mounted (so scroll positions and state survive) with a short crossfade. Put `ref` on the panel; it owns the panel's
 *  visibility, opacity and pointer-events. Runs on the element, no React state (nothing re-renders). A new change stops the running animation; a hidden
 *  panel takes no taps. `appear`: fade in when the panel is first mounted active (otherwise it simply starts in its state). `shiftPx`: 0 = opacity only. */
export function useLayerFade<T extends HTMLElement>(active: boolean, opts: { appear?: boolean; shiftPx?: number } = {}) {
  const { appear = false, shiftPx = MENU.tabShiftPx } = opts;
  const ref = useRef<T>(null);
  const first = useRef(true), token = useRef(0), running = useRef<{ stop: () => void } | null>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const wasFirst = first.current; first.current = false;
    const plan = layerFade(active, reduced, shiftPx);
    const t = ++token.current;
    running.current?.stop();
    if (wasFirst && !(appear && active)) { el.style.visibility = active ? "" : "hidden"; el.style.opacity = active ? "" : "0"; el.style.pointerEvents = active ? "" : "none"; return; }
    if (active) {
      el.style.visibility = ""; el.style.pointerEvents = "";
      if (wasFirst) el.style.opacity = "0";
      el.style.willChange = plan.from ? "opacity, transform" : "opacity";
      const c = animate(el, plan.from ? { opacity: plan.opacity, y: [plan.from, 0] } : { opacity: plan.opacity }, { duration: sec(plan.durationMs), ease: "easeOut" });
      running.current = c;
      c.finished.then(() => { if (t === token.current) { el.style.willChange = ""; el.style.opacity = ""; el.style.transform = ""; } }).catch(() => {});
    } else {
      el.style.pointerEvents = "none"; el.style.willChange = "opacity";
      const c = animate(el, { opacity: 0 }, { duration: sec(plan.durationMs), ease: "easeIn" });
      running.current = c;
      c.finished.then(() => { if (t === token.current) { el.style.visibility = "hidden"; el.style.willChange = ""; } }).catch(() => {});
    }
  }, [active, reduced, appear, shiftPx]);

  useEffect(() => () => { token.current++; running.current?.stop(); }, []);
  return ref;
}
