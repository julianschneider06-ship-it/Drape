import { DOUBLE_TAP_PRESS_MS, DOUBLE_TAP_SLOP_PX, DOUBLE_TAP_WINDOW_MS, GESTURE_MOVE_PX, TAP_OPEN_DELAY_MS, TAP_OPEN_MAX_MS } from "@/config/product-gesture";

export type GestureAction = "like" | "tap" | null;

/** ?tap=<ms> (debug): the open delay in ms, clamped to 0..TAP_OPEN_MAX_MS; anything that is not a plain number is ignored (null = default). */
export function parseTapDelay(search: string): number | null {
  try {
    const v = new URLSearchParams(search).get("tap");
    if (v == null || !/^\s*\d+(\.\d+)?\s*$/.test(v)) return null;
    return Math.min(TAP_OPEN_MAX_MS, Math.max(0, Math.round(Number(v))));
  } catch { return null; }
}
/** The double-tap window that goes with an open delay: never shorter than the default, and always leaves room for a second press after the delay. */
export function doubleTapWindow(openDelay: number = TAP_OPEN_DELAY_MS): number { return Math.max(DOUBLE_TAP_WINDOW_MS, openDelay + DOUBLE_TAP_PRESS_MS); }

/** Tap/double-tap recogniser for one outfit card. Pure (time and coordinates are passed in): up() returns "tap" for a first tap (the caller opens the detail view after TAP_OPEN_DELAY_MS unless a "like" follows) and "like" for the second tap. */
export class ProductGesture {
  private key: string | null = null; private x = 0; private y = 0;
  private active = false;      // finger/button is down and still counts as a tap candidate
  private last: { key: string; t: number; x: number; y: number } | null = null;
  constructor(private windowMs: number = DOUBLE_TAP_WINDOW_MS) {}

  down(key: string, t: number, x: number, y: number) { this.key = key; this.x = x; this.y = y; this.active = true; }
  /** Moving further than GESTURE_MOVE_PX turns the press into a scroll/swipe: no tap, no double tap. */
  move(x: number, y: number): boolean {
    if (!this.active) return false;
    if (Math.hypot(x - this.x, y - this.y) > GESTURE_MOVE_PX) { this.active = false; this.last = null; return true; }
    return false;
  }
  up(t: number): GestureAction {
    if (!this.active || this.key == null) { this.active = false; return null; }
    this.active = false;
    const l = this.last;
    if (l && l.key === this.key && t - l.t <= this.windowMs && Math.hypot(this.x - l.x, this.y - l.y) <= DOUBLE_TAP_SLOP_PX) { this.last = null; return "like"; }
    this.last = { key: this.key, t, x: this.x, y: this.y };
    return "tap";
  }
  cancel() { this.active = false; this.last = null; }
}

/** For You feed double tap: a piece that is not liked gets liked; an already liked piece stays liked and only replays the heart animation (no state change, no event). */
export function feedDoubleTap(alreadyLiked: boolean): "like" | "replay" { return alreadyLiked ? "replay" : "like"; }

/** Delayed single-tap open that a double tap cancels (same timings as the outfit cards: TAP_OPEN_DELAY_MS, DOUBLE_TAP_WINDOW_MS). Used by Wishlist > Products; time and timers are injectable for tests. */
export class DelayedTap {
  private pg: ProductGesture;
  private timer: unknown = null;
  private pending: (() => void) | null = null;   // the open the timer would run
  constructor(private openDelay: number = TAP_OPEN_DELAY_MS, private env: { set: (f: () => void, ms: number) => unknown; clear: (t: unknown) => void; now: () => number } = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>), now: () => Date.now() }) {
    this.pg = new ProductGesture(doubleTapWindow(openDelay));
  }
  private stopTimer() { if (this.timer != null) { this.env.clear(this.timer); this.timer = null; } }
  down(key: string, x: number, y: number) { this.stopTimer(); this.pg.down(key, this.env.now(), x, y); }   // a second press inside the delay holds the open until we know if it is a double tap
  move(x: number, y: number) { this.pg.move(x, y); }
  /** "pending" = first tap, `open` runs after the delay; "double" = second tap, nothing opens; "none" = the press was a scroll (a held first tap still opens). */
  up(open: () => void): "pending" | "double" | "none" {
    const a = this.pg.up(this.env.now()), held = this.pending;
    this.stopTimer(); this.pending = null;
    if (a === "like") return "double";
    if (a === "tap") {
      const run = () => { this.timer = null; this.pending = null; open(); };
      this.pending = run; this.timer = this.env.set(run, this.openDelay);
      return "pending";
    }
    held?.();
    return "none";
  }
  cancel() { this.pg.cancel(); const h = this.pending; this.stopTimer(); this.pending = null; h?.(); }
  dispose() { this.stopTimer(); this.pending = null; }
}
