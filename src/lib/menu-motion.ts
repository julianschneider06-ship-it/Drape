// Pure builders for the menu / overlay animations (tested). Every value comes from src/config/motion.ts; reduced motion = opacity only, short.
import { DURATION_MS, MENU, SHEET, SPRING, sec } from "@/config/motion";

/** delay of the i-th item of a staggered group; the whole stagger stays under the cap */
export const staggerDelay = (i: number, reduced: boolean): number => (reduced ? 0 : sec(Math.min(i * MENU.staggerMs, MENU.staggerCapMs)));

/** fade + slight slide in (and a short fade out) for items that appear: configurator options, hints, messages */
export function fadeSlide(reduced: boolean, shiftPx: number = MENU.itemShiftPx, delay = 0) {
  return {
    initial: { opacity: 0, y: reduced ? 0 : shiftPx },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 0, transition: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.menuOut) } },
    transition: reduced ? { duration: sec(DURATION_MS.reducedFade) } : { opacity: { duration: sec(DURATION_MS.tabIn), delay }, y: { ...SPRING.menu, delay }, scale: SPRING.press },
  };
}

/** colour / opacity changes of a button; with a press scale (spring) when motion is allowed */
export const stateTransition = (reduced: boolean) => ({ default: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.color) }, ...(reduced ? {} : { scale: SPRING.press }) });
export const pressProps = (reduced: boolean, scale: number) => (reduced ? {} : { whileTap: { scale, transition: SPRING.press } });

/** product sheet (and similar popups): panel slides up / scales in with a spring, leaves shorter; backdrop only fades */
export function sheetMotion(reduced: boolean) {
  const out = { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.sheetOut), ease: "easeIn" as const };
  return {
    panel: {
      initial: { opacity: 0, y: reduced ? 0 : SHEET.enterY, scale: reduced ? 1 : SHEET.enterScale },
      animate: { opacity: 1, y: 0, scale: 1, transition: reduced ? { duration: sec(DURATION_MS.reducedFade) } : { ...SPRING.sheet, opacity: { duration: sec(DURATION_MS.tabIn) } } },
      exit: { opacity: 0, y: reduced ? 0 : SHEET.exitY, scale: 1, transition: out },
    },
    backdrop: {
      initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.backdropIn) } },
      exit: { opacity: 0, transition: { duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.backdropOut) } },
    },
  };
}

/** a panel that stays mounted and is shown / hidden (tab content, configurator <-> results): what to animate when `active` changes */
export function layerFade(active: boolean, reduced: boolean, shiftPx: number = MENU.tabShiftPx) {
  const ms = reduced ? DURATION_MS.reducedFade : active ? DURATION_MS.tabIn : DURATION_MS.tabOut;
  return { opacity: active ? 1 : 0, from: active && !reduced ? shiftPx : 0, durationMs: ms, hideAfterMs: active ? 0 : ms };
}
