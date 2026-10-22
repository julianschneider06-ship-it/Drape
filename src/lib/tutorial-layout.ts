import { ACTION_RAIL_WIDTH } from "@/config/action-rail";
import { LAYOUT_SAFE_MARGIN } from "@/config/layout-safe";
import { TUTORIAL } from "@/config/tutorial";

/** Horizontal room for tutorial text boxes: inside the safe margin on the left, clear of the action rail (heart) on the right. */
export function boxSpan(vw: number) {
  const lo = LAYOUT_SAFE_MARGIN.left, hi = vw - ACTION_RAIL_WIDTH - TUTORIAL.railGap;
  return { lo, hi, w: Math.max(0, Math.min(TUTORIAL.boxMaxW, hi - lo)) };
}
/** left edge of a box of width w centred on cx (shifted by `dx`), kept inside the span */
export function boxLeft(cx: number, vw: number, w: number, dx = 0) {
  const { lo, hi } = boxSpan(vw);
  return Math.min(hi - w, Math.max(lo, cx - w / 2 + dx));
}
