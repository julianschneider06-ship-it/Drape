"use client";
import { memo } from "react";
import * as m from "motion/react-m";
import { MENU, MENU_COLORS, SPRING, DURATION_MS, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { pressProps, stateTransition } from "@/lib/menu-motion";

/** Segmented switch (Men | Women, Products | Generate Outfits): a black pill slides to the chosen segment with a spring (transform only, shared layoutId);
 *  the label colour fades. Reduced motion: the pill just fades in under the new segment. Same look as before. */
function Segmented<T extends string>({ id, options, value, onChange, label, className = "", disabled = false, compact = false }: {
  compact?: boolean; id: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string; disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`flex rounded-full bg-neutral-100 p-0.5 text-sm ${className}`} role="tablist" aria-label={label} style={disabled ? { pointerEvents: "none" } : undefined}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <m.button key={o.id} type="button" role="tab" aria-selected={on} onClick={() => !on && onChange(o.id)} {...pressProps(reduced, MENU.pressScale)}
            transition={stateTransition(reduced)} className={`relative rounded-full py-1 ${compact ? "px-3 text-[13px]" : "px-4"}`}>
            {on && (reduced
              ? <m.span aria-hidden className="absolute inset-0 rounded-full bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: sec(DURATION_MS.reducedFade) }} />
              : <m.span aria-hidden layoutId={`${id}-pill`} className="absolute inset-0 rounded-full bg-black" transition={SPRING.pill} />)}
            <m.span className="relative" initial={false} animate={on ? MENU_COLORS.pill.on : MENU_COLORS.pill.off} transition={{ duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.color) }}>{o.label}</m.span>
          </m.button>
        );
      })}
    </div>
  );
}
export default memo(Segmented) as typeof Segmented;
