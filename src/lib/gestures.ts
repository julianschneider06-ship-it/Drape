import { AXIS_LOCK_PX, HORIZONTAL_BIAS, SHEET_CLOSE_FLICK_MIN_PX, SHEET_CLOSE_MIN_VELOCITY, SHEET_SNAP_CLOSE_RATIO, SWAP_FLICK_MIN_PX, SWAP_MIN_PX, SWAP_MIN_VELOCITY } from "@/config/gestures";

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

export type SheetDrag = { offset: number; action: "ignore" | "follow" | "commit" };

/**
 * Product sheet drag (finger offset from the press, dtMs since the press, scrollTop at the press, sheetH = sheet height in px).
 * "ignore": upward, not vertically dominant yet, or the content was scrolled and the press was not on the handle / image (scrolling wins) -> offset 0.
 * "follow": the sheet moves 1:1 with the finger; releasing here springs back.
 * "commit": passed SHEET_SNAP_CLOSE_RATIO of the sheet height, or a fast flick (works below the ratio too) -> close now, further movement is ignored.
 */
export function sheetDrag(dx: number, dy: number, dtMs: number, scrollTop: number, onHandleOrImage: boolean, sheetH: number): SheetDrag {
  if (dy <= 0 || decideAxis(dx, dy) !== "y") return { offset: 0, action: "ignore" };
  if (scrollTop > 0 && !onHandleOrImage) return { offset: 0, action: "ignore" };
  const flick = dy >= SHEET_CLOSE_FLICK_MIN_PX && dtMs > 0 && dy / dtMs >= SHEET_CLOSE_MIN_VELOCITY;
  if (flick || (sheetH > 0 && dy >= SHEET_SNAP_CLOSE_RATIO * sheetH)) return { offset: dy, action: "commit" };
  return { offset: dy, action: "follow" };
}

/**
 * Should a touchmove inside the sheet be cancelled so the page / feed behind never moves? Only the panel's own content may scroll, and only
 * while it can still move in the finger's direction (finger down = content scrolls up = needs scrollTop > 0).
 */
export function blockTouchMove(insidePanel: boolean, scrollable: boolean, scrollTop: number, maxScroll: number, dy: number): boolean {
  if (!insidePanel || !scrollable) return true;
  if (dy > 0) return scrollTop <= 0;
  if (dy < 0) return scrollTop >= maxScroll;
  return false;
}
