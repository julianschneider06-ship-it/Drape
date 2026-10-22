import { DURATION_MS, HEART, LIKE_POP, SPRING, sec, type SpringToken } from "@/config/motion";

export type HeartEvent = "press" | "release" | "like" | "unlike";
export interface HeartStep { scale: number; transition: SpringToken }

/** Scale steps of a heart button, run one after the other. Reduced motion: no steps (only the colour fade, done by CSS). */
export function heartPlan(ev: HeartEvent, reduced: boolean): HeartStep[] {
  if (reduced) return [];
  switch (ev) {
    case "press": return [{ scale: HEART.pressScale, transition: SPRING.press }];
    case "like": return [{ scale: HEART.popScale, transition: SPRING.pop }, { scale: 1, transition: SPRING.settle }];
    default: return [{ scale: 1, transition: SPRING.settle }];   // release and soft unlike: no pop
  }
}

/** CSS transition for the heart colour (fill/stroke); under reduced motion a shorter fade. */
export const heartFillTransition = (reduced: boolean) => {
  const ms = reduced ? DURATION_MS.reducedFade : DURATION_MS.fill;
  return `fill ${sec(ms)}s ease, stroke ${sec(ms)}s ease`;
};

/** Which animation a like state change triggers: only a real change, never the first render. */
export const likeEvent = (prev: boolean, now: boolean): HeartEvent | null => (prev === now ? null : now ? "like" : "unlike");

/** Total length of the double-tap overlay in ms (like: pop + fade; unlike: quiet version; reduced: one fade). */
export const likePopTotalMs = (liked: boolean, reduced: boolean) => (reduced ? DURATION_MS.reducedFade * 2 : liked ? 600 : LIKE_POP.undo.totalMs);
