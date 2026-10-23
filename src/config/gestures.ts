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

/** Product sheet: the sheet follows a downward drag 1:1; once the drag passed this share of the sheet height the close is COMMITTED (exit animation, finger may still be down). Below it, release springs back. */
export const SHEET_SNAP_CLOSE_RATIO = 0.10;
/** A fast downward flick also closes, even below the ratio: from SHEET_CLOSE_FLICK_MIN_PX when at least this fast (px per ms). */
export const SHEET_CLOSE_MIN_VELOCITY = 0.5;
export const SHEET_CLOSE_FLICK_MIN_PX = 16;
