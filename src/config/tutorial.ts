// First-visit tutorial (display only). Texts, box sizes and demo timings live here; springs, durations and the heart look come from motion.ts / action-rail.ts.
export const TUTORIAL = {
  boxMaxW: 250,                        // px, widest text box
  boxH: 66, boxHHeart: 78,             // px, text box heights (the heart text is longer)
  buttonW: 104, buttonH: 44,           // px, "Next" / "Got it"
  railGap: 8,                          // px kept free between a text box and the action rail
  heartLeadY: 30,                      // px the heart text box sits above the heart's centre line
  heartDemo: { restMs: 1100, likedMs: 1700 },   // demo heart: white for restMs, red for likedMs, loop
  popDemo: { firstMs: 700, periodMs: 2200 },    // demo double-tap: like pop at firstMs, quiet unlike pop half a period later, loop
  text: {
    swipeUp: "Swipe up to see the next outfit",
    alts: "Swipe left or right to see alternatives",
    sale: "Red mark = on sale",
    heart: "Tap the heart to like the whole outfit. Tap it again to undo.",
    tap: "Tap a product once to see its details",
    doubleTap: "Double-tap a product to like or unlike it",
    next: "Next", done: "Got it",
  },
} as const;
