"use client";
import * as m from "motion/react-m";
import { DISABLED_OPACITY, DURATION_MS, MENU, MENU_COLORS, SPRING, SWITCH, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { pressProps } from "@/lib/menu-motion";

/** On / off switch: the track colour fades, the thumb slides with a spring (transform only); reduced motion: no slide spring, short fade. */
export default function Switch({ on, onChange, label, disabled = false }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <m.button type="button" role="switch" aria-checked={on} aria-label={label} aria-disabled={disabled || undefined} disabled={disabled} onClick={() => onChange(!on)}
      {...(disabled ? {} : pressProps(reduced, MENU.chipPress))} initial={false} animate={{ ...(on ? MENU_COLORS.switchTrack.on : MENU_COLORS.switchTrack.off), opacity: disabled ? DISABLED_OPACITY : 1 }}
      transition={{ duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.color) }}
      className="relative shrink-0 rounded-full" style={{ width: SWITCH.width, height: SWITCH.height }}>
      <m.span aria-hidden className="absolute rounded-full bg-white shadow-sm" style={{ top: SWITCH.pad, left: SWITCH.pad, width: SWITCH.thumb, height: SWITCH.thumb }}
        initial={false} animate={{ x: on ? SWITCH.width - SWITCH.thumb - 2 * SWITCH.pad : 0 }} transition={reduced ? { duration: sec(DURATION_MS.reducedFade) } : SPRING.pill} />
    </m.button>
  );
}
