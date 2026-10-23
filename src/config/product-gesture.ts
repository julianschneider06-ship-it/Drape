// Product gestures on outfit cards (feed, Search results, Wishlist > Generate Outfits). Single tap = open the detail view (after the double-tap window), double tap = like, no long press.
export const TAP_OPEN_DELAY_MS = 160;    // a single tap opens the detail view this long after the finger lifts, unless a second tap starts first (?tap=<ms> overrides it, debug only)
export const DOUBLE_TAP_WINDOW_MS = 300; // first lift -> second lift of a double tap. Larger than the open delay on purpose: the second tap must START within TAP_OPEN_DELAY_MS (that cancels the pending open) and may then take up to the rest of this window to lift
export const TAP_OPEN_MAX_MS = 400;      // ?tap=<ms> is clamped to 0..TAP_OPEN_MAX_MS
export const DOUBLE_TAP_PRESS_MS = 140;  // room for the second press: with ?tap=<ms> the window is at least delay + this
export const GESTURE_MOVE_PX = 8;        // finger/mouse moving further than this cancels the tap (scrolling and swiping keep working)
export const DOUBLE_TAP_SLOP_PX = 40;    // the second tap must land this close to the first
export const LIKE_PULSE_COLORS = { liked: "#e5252a", unliked: "#9ca3af" };
