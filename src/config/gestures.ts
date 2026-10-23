// Thresholds for the swipe gestures. Pure decisions live in src/lib/gestures.ts; tap / double-tap timing is NOT here (see product-gesture.ts).

/** Piece swap vs. outfit scroll: the axis is decided once the finger has moved this far (px). */
export const AXIS_LOCK_PX = 9;
/** Horizontal wins when |dx| > HORIZONTAL_BIAS * |dy| (generous: slightly diagonal swipes still swap). */
export const HORIZONTAL_BIAS = 0.8;
/** A slow drag swaps the piece from this horizontal distance (px). */
export const SWAP_MIN_PX = 28;
/** A fast flick swaps from SWAP_FLICK_MIN_PX when it is at least this fast (px per ms). */
export const SWAP_MIN_VELOCITY = 0.35;
export const SWAP_FLICK_MIN_PX = 14;

/** Product sheet: a downward swipe is a close COMMAND (the sheet never follows the finger). It fires once the finger moved down this far (px) with vertical dominance ... */
export const SHEET_CLOSE_MIN_PX = 40;
/** ... or earlier, from SHEET_CLOSE_FLICK_MIN_PX, when the swipe is at least this fast (px per ms). */
export const SHEET_CLOSE_MIN_VELOCITY = 0.5;
export const SHEET_CLOSE_FLICK_MIN_PX = 16;
