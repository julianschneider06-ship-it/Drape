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

/** Product sheet: closes when dragged down past this share of its height ... */
export const SHEET_DISMISS_RATIO = 0.25;
/** ... or released with at least this downward speed (px per ms); otherwise it springs back. */
export const SHEET_DISMISS_VELOCITY = 0.5;
