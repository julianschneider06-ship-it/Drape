"use client";
import { useCallback, useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useReducedMotion } from "@/lib/motion";
import { heartPlan, likeEvent, type HeartEvent } from "@/lib/heart-motion";

/** Press feedback + pop for a heart. Put `ref` on the element that scales (inside the button), spread `bind` on the button.
 *  Animation runs directly on the element (no React state), a new animation stops the running one, so rapid taps never stack. */
export function useHeartMotion(on: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const token = useRef(0), running = useRef<{ stop: () => void } | null>(null), pressed = useRef(false);
  const prev = useRef(on);
  const reduced = useReducedMotion();

  const run = useCallback((ev: HeartEvent) => {
    const el = ref.current; if (!el) return;
    const t = ++token.current;
    running.current?.stop();
    (async () => {
      for (const s of heartPlan(ev, reduced)) {
        if (t !== token.current) return;
        const c = animate(el, { scale: s.scale }, s.transition);
        running.current = c;
        await c.finished.catch(() => {});
      }
      if (t === token.current) el.style.willChange = "";
    })();
    if (heartPlan(ev, reduced).length) el.style.willChange = "transform";
  }, [reduced]);

  useEffect(() => { const ev = likeEvent(prev.current, on); prev.current = on; if (ev) run(ev); }, [on, run]);
  useEffect(() => () => { token.current++; running.current?.stop(); }, []);

  const release = useCallback(() => { if (pressed.current) { pressed.current = false; run("release"); } }, [run]);
  const bind = { onPointerDown: () => { pressed.current = true; run("press"); }, onPointerUp: release, onPointerCancel: release, onPointerLeave: release };
  return { ref, bind, reduced };
}
