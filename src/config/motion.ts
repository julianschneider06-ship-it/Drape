// Motion tokens for ALL animations (library: "motion"): like animations plus every menu, switch, sheet and message (MENU / SHEET below). Every animation must take its springs and durations from here.
// Only transform / opacity (and heart colour fades) are animated. Reduced motion: no scale or movement, only a short opacity / colour change.
export type SpringToken = { type: "spring"; stiffness: number; damping: number; mass: number };
const spring = (stiffness: number, damping: number, mass = 1): SpringToken => ({ type: "spring", stiffness, damping, mass });

export const SPRING = {
  press: spring(700, 34),     // finger down / up: quick, no overshoot
  pop: spring(520, 15),       // like pop: lively overshoot
  settle: spring(380, 24),    // return to rest: soft landing
  menu: spring(420, 34),      // menu items and small messages sliding in: soft, no overshoot
  pill: spring(520, 38),      // sliding highlight of segmented switches and the bottom-bar indicator
  sheet: spring(400, 34),     // sheets / popups opening
} as const;

export const DURATION_MS = {
  fill: 200,                  // heart colour change (white <-> red, black <-> white)
  fadeIn: 90,                 // overlay heart appears
  fadeOut: 300,               // overlay heart leaves
  reducedFade: 120,           // everything under reduced motion
  tabIn: 200,                 // content of a bottom-bar tab / panel fades in
  tabOut: 140,                // ... and out
  menuOut: 140,               // small messages and chips leave
  sheetOut: 180,              // sheet closes: faster and softer than it opened
  backdropIn: 200, backdropOut: 150,
  color: 160,                 // chip / button colour and opacity changes
  counter: 150,               // Search (N) number changes
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

/** Menus, switches and panels. Distances in px, press scales as factors. */
export const MENU = {
  pressScale: 0.94,           // bottom-bar tabs, segmented buttons
  chipPress: 0.97,            // option chips, big buttons
  tabShiftPx: 6,              // incoming tab panel / configurator <-> results: tiny slide
  itemShiftPx: 10,            // configurator steps and options, small messages
  hintShiftPx: 6,             // hints and short messages
  staggerMs: 25,              // per item
  staggerCapMs: 150,          // the whole stagger never takes longer than this
} as const;

/** Product sheet and other popups: slide up a modest distance, close shorter. */
export const SHEET = { enterY: 56, exitY: 24, enterScale: 0.98 } as const;

/** Colours that fade (neutral-* values of the design). */
export const MENU_COLORS = {
  chip: { on: { borderColor: "#000000", backgroundColor: "#fafafa" }, off: { borderColor: "#e5e5e5", backgroundColor: "#ffffff" } },
  pill: { on: { color: "#ffffff" }, off: { color: "#525252" } },
  nav: { on: "#000000", off: "#a3a3a3" },
  toggle: { on: { borderColor: "#000000", backgroundColor: "#000000", color: "#ffffff" }, off: { borderColor: "#e5e5e5", backgroundColor: "#ffffff", color: "#000000" } },
  action: { on: { backgroundColor: "#000000" }, off: { backgroundColor: "#d4d4d4" } },
  switchTrack: { on: { backgroundColor: "#000000" }, off: { backgroundColor: "#d4d4d4" } },
} as const;
/** On / off switch (Profile settings): track and thumb sizes in px; the thumb slides with SPRING.pill, the track colour fades. */
export const SWITCH = { width: 44, height: 26, thumb: 22, pad: 2 } as const;
/** Opacity of disabled options / buttons. */
export const DISABLED_OPACITY = 0.35;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export const sec = (ms: number) => ms / 1000;
