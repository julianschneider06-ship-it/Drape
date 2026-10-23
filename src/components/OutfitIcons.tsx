"use client";
import { memo, useEffect, useSyncExternalStore } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import type { IconId } from "@/lib/outfit-icons";
import { ICON_HIT_PX, ICON_LABELS, ICON_LABEL_STYLE } from "@/config/icon-labels";
import { labelStore } from "@/lib/icon-label";
import { DURATION_MS, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";

// Rough, abstract line marks (a few thin strokes, 24x24, no fills). Display only: no animation, no images, inline SVG.
const D: Record<IconId, React.ReactNode> = {
  "family-smart": <path d="M12 8.5a1.7 1.7 0 1 0-1.7-1.7M12 10.5v1.2L4.5 16.5h15L12 11.7" />,                                   // hanger
  "family-street": <><path d="M4 11.5h16M4 11.5q-1 0-1-1M20 11.5q1 0 1-1" /><circle cx="8" cy="15" r="1.2" /><circle cx="16" cy="15" r="1.2" /></>,   // skateboard
  "family-active": <path d="M3.5 17.5l5.5-9 3.5 5.5 2.5-3.5 5.5 7z" />,                                                          // peaks
  "family-rugged": <path d="M6.5 6.5h11v6.5L12 17l-5.5-4zM6.5 9.5h11" />,                                                         // jeans pocket
  "family-soft": <path d="M12 12C9.5 7.5 5 8 5 11.5S9.5 15 12 12c2.5 3 7 3.5 7 0S14.5 7.5 12 12z" />,                              // bow
  "season-spring": <path d="M12 19v-7m0 0c0-3-2-4.5-5-4.5 0 3 2 4.5 5 4.5zm0 2c0-2.5 1.8-4 4.5-4 0 2.5-1.8 4-4.5 4z" />,          // sprout
  "season-summer": <><circle cx="12" cy="12" r="3.2" /><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" /></>,   // sun
  "season-autumn": <path d="M6 18c0-7 4-11 12-11 0 8-4 12-11 12M6 18l8-8" />,                                                     // leaf
  "season-winter": <path d="M12 4.5v15M5.5 8.2l13 7.6M18.5 8.2l-13 7.6" />,                                                       // snowflake
  rain: <path d="M12 5.5C9.5 9 8 11 8 13.5a4 4 0 0 0 8 0c0-2.5-1.5-4.5-4-8z" />,                                                   // drop
  evening: <path d="M15.5 5.5a7 7 0 1 0 3 9.5 6 6 0 0 1-3-9.5z" />,                                                                // crescent
  office: <path d="M5.5 9h13v8h-13zM9.5 9V7h5v2" />,                                                                               // briefcase
  resort: <path d="M3.5 10q2.2-2 4.2 0t4.2 0 4.2 0 4.2 0M3.5 15q2.2-2 4.2 0t4.2 0 4.2 0 4.2 0" />,                                  // waves
  contrast: <path d="M4 15l4-6 4 6 4-6 4 6" />,                                                                                    // zigzag
  bold: <path d="M12 4.5v4M12 15.5v4M4.5 12h4M15.5 12h4M7 7l2.5 2.5M14.5 14.5L17 17M17 7l-2.5 2.5M9.5 14.5L7 17" />,                 // burst
  tonal: <><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="3" /></>,                                                // rings
  colourful: <><circle cx="9" cy="10" r="3" /><circle cx="15" cy="10" r="3" /><circle cx="12" cy="15" r="3" /></>,                  // three dots
  formal: <path d="M12 5l5 7-5 7-5-7z" />,
  "item-accessory": <><circle cx="7.5" cy="13" r="3" /><circle cx="16.5" cy="13" r="3" /><path d="M10.5 13h3M4.5 13L5 8.5M19.5 13L19 8.5" /></>,                    // sunglasses
  "item-shoes": <path d="M4 17h16v-2.4c-3 0-4.2-1.4-5.2-3.4l-2.4 1.2c-1.7-1-2.5-2.6-2.8-4.3L7 8.5C6.6 12 5.6 14.4 4 14.8z" />,                                      // sneaker
  "item-top": <path d="M9 5.5L4 8l1.8 3.6L8 10.5V18.5h8v-8l2.2 1.1L20 8l-5-2.5q-1.2 1.6-3 1.6T9 5.5z" />,                                                          // t-shirt
  "dir-women": <path d="M10 4.5h4l.4 5L18 19H6l3.6-9.5z" />,                                                                                                       // dress
  "dir-men": <path d="M10 5h4l-1 3 1.6 9-2.6 2-2.6-2L11 8z" />,                                                                                                      // tie
  "item-bottom": <path d="M7.5 5h9l1.2 14h-4.2L12 10.5 10.5 19H6.3z" />,                                                                                              // trousers                                                                                         // diamond
};

/** one icon glyph (the same marks the outfit cards use; the Search tab reuses it so both speak the same visual language) */
export function IconGlyph({ id, size = 16, stroke = "#8b9099", width = 1.5 }: { id: IconId; size?: number; stroke?: string; width?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{D[id]}</svg>;
}

/** small see-through circles at the top left of an outfit card; a tap on one shows its one-word label (src/lib/icon-label.ts, one label at a time) */
function OutfitIcons({ icons, outfitKey, style }: { icons: IconId[]; outfitKey: string | number; style?: React.CSSProperties }) {
  const shown = useSyncExternalStore(labelStore.subscribe, labelStore.get, () => null);
  const reduced = useReducedMotion();
  const has = icons.length > 0;
  useEffect(() => {   // any other interaction hides the label at once: a press outside the icons (piece tap, swipe start, sheet), scroll, wheel
    if (!has) return;
    const hide = () => labelStore.dispatch({ type: "hide" });
    const press = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-icon-btn]")) hide(); };
    document.addEventListener("pointerdown", press, true); document.addEventListener("scroll", hide, true); document.addEventListener("wheel", hide, { capture: true, passive: true });
    return () => { document.removeEventListener("pointerdown", press, true); document.removeEventListener("scroll", hide, true); document.removeEventListener("wheel", hide, true); };
  }, [has]);
  useEffect(() => () => { if (labelStore.get()?.startsWith(`${outfitKey}:`)) labelStore.dispatch({ type: "hide" }); }, [outfitKey]);
  if (!has) return null;
  const padX = (ICON_HIT_PX.w - 26) / 2, padY = (ICON_HIT_PX.h - 26) / 2;
  return (
    <div className="absolute z-20 flex" data-outfit-icons={icons.join(" ")} style={{ left: `calc(0.75rem - ${padX}px)`, top: `calc(max(0.75rem, env(safe-area-inset-top)) + 2.75rem + 0.25rem - ${padY}px)`, ...style }}>
      {icons.map((id) => {
        const key = `${outfitKey}:${id}`, on = shown === key, label = ICON_LABELS[id];
        return (
          <button key={id} type="button" data-icon-btn aria-label={label} onClick={() => labelStore.dispatch({ type: "tap", key })}
            className="relative flex items-center justify-center" style={{ width: ICON_HIT_PX.w, height: ICON_HIT_PX.h, touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full" style={{ background: "rgba(229,231,235,0.55)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b9099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{D[id]}</svg>
            </span>
            <AnimatePresence>
              {on && (
                <m.span key="l" className="pointer-events-none absolute left-1/2 whitespace-nowrap" style={{ top: `calc(50% + 13px + ${ICON_LABEL_STYLE.gapPx}px)`, x: "-50%", fontSize: ICON_LABEL_STYLE.fontSize, color: ICON_LABEL_STYLE.color, lineHeight: 1.2 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.tabIn) } }} exit={{ opacity: 0, transition: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.menuOut) } }}>{label}</m.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
    </div>
  );
}
export default memo(OutfitIcons, (a, b) => a.outfitKey === b.outfitKey && a.style === b.style && a.icons.length === b.icons.length && a.icons.every((x, i) => x === b.icons[i]));
