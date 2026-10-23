import { AXIS_LOCK_PX, HORIZONTAL_BIAS, SHEET_CLOSE_FLICK_MIN_PX, SHEET_CLOSE_MIN_PX, SHEET_CLOSE_MIN_VELOCITY, SWAP_FLICK_MIN_PX, SWAP_MIN_PX, SWAP_MIN_VELOCITY } from "@/config/gestures";

export type Axis = "x" | "y" | null;

/** Axis lock: null until the finger moved AXIS_LOCK_PX, then "x" (piece swap) when horizontal is not clearly beaten, else "y" (outfit scroll). */
export function decideAxis(dx: number, dy: number): Axis {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_LOCK_PX) return null;
  return ax > HORIZONTAL_BIAS * ay ? "x" : "y";
}

/** Swap on release: far enough, or a short fast flick. */
export function swapOnRelease(dx: number, dtMs: number): boolean {
  const ax = Math.abs(dx);
  if (ax >= SWAP_MIN_PX) return true;
  return ax >= SWAP_FLICK_MIN_PX && dtMs > 0 && ax / dtMs >= SWAP_MIN_VELOCITY;
}

/**
 * Product sheet: should this move (finger offset from the press, dtMs since the press) close the sheet? Downward, vertically dominant, and either far enough
 * or a short fast flick. When the content is scrolled, only a swipe that began on the handle / image counts (scrolling wins otherwise).
 */
export function sheetCloseSwipe(dx: number, dy: number, dtMs: number, scrollTop: number, onHandleOrImage: boolean): boolean {
  if (dy <= 0 || decideAxis(dx, dy) !== "y") return false;
  if (scrollTop > 0 && !onHandleOrImage) return false;
  if (dy >= SHEET_CLOSE_MIN_PX) return true;
  return dy >= SHEET_CLOSE_FLICK_MIN_PX && dtMs > 0 && dy / dtMs >= SHEET_CLOSE_MIN_VELOCITY;
}
