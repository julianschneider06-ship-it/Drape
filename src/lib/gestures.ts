import { AXIS_LOCK_PX, HORIZONTAL_BIAS, SHEET_DISMISS_RATIO, SHEET_DISMISS_VELOCITY, SWAP_FLICK_MIN_PX, SWAP_MIN_PX, SWAP_MIN_VELOCITY } from "@/config/gestures";

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

/** Product sheet: start dragging only on a downward move, and only when the content is at the top (or the drag began on the handle / image). */
export function sheetDragStarts(dx: number, dy: number, scrollTop: number, onHandleOrImage: boolean): boolean {
  return decideAxis(dx, dy) === "y" && dy > 0 && (scrollTop <= 0 || onHandleOrImage);
}

/** Product sheet release: dismiss past the ratio of its height or with a fast downward flick (vy in px per ms, positive = down). */
export function sheetDismiss(dy: number, heightPx: number, vy: number): boolean {
  if (dy <= 0) return false;
  return dy >= heightPx * SHEET_DISMISS_RATIO || vy >= SHEET_DISMISS_VELOCITY;
}
