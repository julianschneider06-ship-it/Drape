// Product gestures on outfit cards (feed, Search results, Wishlist > Generate Outfits). Single tap = open the detail view (after the double-tap window), double tap = like, no long press.
export const DOUBLE_TAP_MS = 300;        // two taps within this window toggle the like; a single tap opens the detail view once this window has passed
export const GESTURE_MOVE_PX = 8;        // finger/mouse moving further than this cancels the tap (scrolling and swiping keep working)
export const DOUBLE_TAP_SLOP_PX = 40;    // the second tap must land this close to the first
export const LIKE_PULSE_COLORS = { liked: "#e5252a", unliked: "#9ca3af" };
