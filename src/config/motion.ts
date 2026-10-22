// Motion tokens for ALL animations (library: "motion", only like animations so far). Every animation must take its springs and durations from here.
// Only transform / opacity (and heart colour fades) are animated. Reduced motion: no scale or movement, only a short opacity / colour change.
export type SpringToken = { type: "spring"; stiffness: number; damping: number; mass: number };
const spring = (stiffness: number, damping: number, mass = 1): SpringToken => ({ type: "spring", stiffness, damping, mass });

export const SPRING = {
  press: spring(700, 34),     // finger down / up: quick, no overshoot
  pop: spring(520, 15),       // like pop: lively overshoot
  settle: spring(380, 24),    // return to rest: soft landing
} as const;

export const DURATION_MS = {
  fill: 200,                  // heart colour change (white <-> red, black <-> white)
  fadeIn: 90,                 // overlay heart appears
  fadeOut: 300,               // overlay heart leaves
  reducedFade: 120,           // everything under reduced motion
} as const;

/** Buttons: press and pop of every heart (rail, Wishlist, product sheet). */
export const HEART = { pressScale: 0.88, popScale: 1.2 } as const;

/** Double-tap like on a product (overlay heart + product impulse). Total about 600 ms. */
export const LIKE_POP = {
  size: 40,                   // px, overlay heart
  startScale: 0.4, peakScale: 1.15,
  driftPx: -22,               // upward drift while fading
  pieceImpulse: 1.03,         // product scale impulse
  undo: { size: 32, startScale: 0.9, driftPx: -8, opacity: 0.85, totalMs: 350 },   // quieter version when un-liking
} as const;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const sec = (ms: number) => ms / 1000;
