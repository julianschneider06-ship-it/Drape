import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX, GESTURE_MOVE_PX } from "@/config/product-gesture";

export type GestureAction = "like" | "open" | null;

/** Tap/double-tap/long-press recogniser for one outfit card. Pure (time and coordinates are passed in): single tap = nothing, no waiting for a second tap. */
export class ProductGesture {
  private key: string | null = null; private x = 0; private y = 0;
  private active = false;      // finger/button is down and still counts as a tap candidate
  private last: { key: string; t: number; x: number; y: number } | null = null;

  down(key: string, t: number, x: number, y: number) { this.key = key; this.x = x; this.y = y; this.active = true; }
  /** Moving further than GESTURE_MOVE_PX turns the press into a scroll/swipe: no tap, no long press, no double tap. */
  move(x: number, y: number): boolean {
    if (!this.active) return false;
    if (Math.hypot(x - this.x, y - this.y) > GESTURE_MOVE_PX) { this.active = false; this.last = null; return true; }
    return false;
  }
  /** The long-press timer fired while the press was still a candidate: open the detail view; the release afterwards does nothing. */
  longPress(): GestureAction {
    if (!this.active) return null;
    this.active = false; this.last = null;
    return "open";
  }
  up(t: number): GestureAction {
    if (!this.active || this.key == null) { this.active = false; return null; }
    this.active = false;
    const l = this.last;
    if (l && l.key === this.key && t - l.t <= DOUBLE_TAP_MS && Math.hypot(this.x - l.x, this.y - l.y) <= DOUBLE_TAP_SLOP_PX) { this.last = null; return "like"; }
    this.last = { key: this.key, t, x: this.x, y: this.y };
    return null;
  }
  cancel() { this.active = false; this.last = null; }
}
