// Product gestures on outfit cards (feed, Search results, Wishlist > Generate Outfits). Single tap = nothing.
export const LONG_PRESS_MS = 450;        // press and hold on a piece opens the detail view
export const DOUBLE_TAP_MS = 300;        // two taps within this window toggle the like
export const GESTURE_MOVE_PX = 8;        // finger/mouse moving further than this cancels the press (scrolling and swiping keep working)
export const DOUBLE_TAP_SLOP_PX = 40;    // the second tap must land this close to the first
export const LIKE_PULSE_MS = 400;        // heart pulse on the piece after a double-tap like
export const LIKE_PULSE_COLORS = { liked: "#e5252a", unliked: "#9ca3af" };
