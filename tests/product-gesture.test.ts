import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductGesture, doubleTapWindow, feedDoubleTap, parseTapDelay } from "../src/lib/product-gesture";
import { DOUBLE_TAP_WINDOW_MS, GESTURE_MOVE_PX, TAP_OPEN_DELAY_MS } from "../src/config/product-gesture";
import { RAIL_HEART } from "../src/config/action-rail";

const tap = (g: ProductGesture, key: string, t: number, x = 10, y = 10) => { g.down(key, t, x, y); return g.up(t + 40); };

test("config values", () => {
  assert.equal(TAP_OPEN_DELAY_MS, 160); assert.equal(DOUBLE_TAP_WINDOW_MS, 300);
  assert.ok(DOUBLE_TAP_WINDOW_MS > TAP_OPEN_DELAY_MS);
  assert.equal(RAIL_HEART.restFill, "#ffffff"); assert.notEqual(RAIL_HEART.likedFill, RAIL_HEART.restFill);
});
test("single tap is reported as a tap (caller opens after the window)", () => { assert.equal(tap(new ProductGesture(), "a", 0), "tap"); });
test("double tap likes, third tap starts over", () => {
  const g = new ProductGesture();
  assert.equal(tap(g, "a", 0), "tap");
  assert.equal(tap(g, "a", 150), "like");
  assert.equal(tap(g, "a", 300), "tap");   // no double trigger on a quick third tap
  assert.equal(tap(g, "a", 450), "like");
});
test("two taps too far apart or on different pieces are no double tap", () => {
  const g = new ProductGesture();
  tap(g, "a", 0);
  assert.equal(tap(g, "a", 40 + DOUBLE_TAP_WINDOW_MS + 10), "tap");
  assert.equal(tap(g, "b", 40 + DOUBLE_TAP_WINDOW_MS + 100), "tap");
  const h = new ProductGesture(); tap(h, "a", 0, 10, 10);
  assert.equal(tap(h, "a", 100, 200, 200), "tap");
});
test("movement cancels the tap (scroll / swipe)", () => {
  const g = new ProductGesture();
  g.down("a", 0, 5, 5);
  assert.equal(g.move(5, 5 + GESTURE_MOVE_PX), false);   // within tolerance
  assert.equal(g.move(5, 5 + GESTURE_MOVE_PX + 2), true);
  assert.equal(g.up(100), null);
  assert.equal(tap(g, "a", 150), "tap");   // the drag did not count as first tap, so this is no double tap
});
test("cancel (pointercancel) drops the press", () => {
  const g = new ProductGesture();
  tap(g, "a", 0);
  g.down("a", 100, 10, 10); g.cancel();
  assert.equal(g.up(140), null);
});

test("no long press API: holding is just a slow tap", () => {
  const g = new ProductGesture() as unknown as Record<string, unknown>;
  assert.equal(g.longPress, undefined);
  const p = new ProductGesture(); p.down("a", 0, 5, 5);
  assert.equal(p.up(2000), "tap");
});

// Timing model of the caller (OutfitCanvas): first "tap" arms an open after TAP_OPEN_DELAY_MS; a second press that STARTS before that cancels it; "like" never opens.
function simulate(events: Array<[number, number]>, delay = TAP_OPEN_DELAY_MS) {   // [downAt, upAt] pairs on one piece
  let g = new ProductGesture(doubleTapWindow(delay)); let openAt: number | null = null; let likes = 0; let opens = 0;
  for (const [d, u] of events) {
    if (openAt != null && d < openAt) openAt = null;             // press began inside the delay: hold the open
    else if (openAt != null) { opens++; openAt = null; g = new ProductGesture(doubleTapWindow(delay)); }   // the open already fired: the detail view covers the card, the next press starts fresh
    g.down("a", d, 10, 10); const a = g.up(u);
    if (a === "like") likes++; else if (a === "tap") openAt = u + delay;
  }
  if (openAt != null) opens++;
  return { likes, opens };
}
test("single tap opens once, after the delay", () => { assert.deepEqual(simulate([[0, 60]]), { likes: 0, opens: 1 }); });
test("double tap likes and does not open (also with a slow second press)", () => {
  assert.deepEqual(simulate([[0, 60], [120, 180]]), { likes: 1, opens: 0 });
  assert.deepEqual(simulate([[0, 60], [200, 320]]), { likes: 1, opens: 0 });   // second press starts at 140 ms after lift, lifts 120 ms later: inside the 300 ms window
});
test("a second tap after the delay is a new single tap (the first one already opened)", () => { assert.deepEqual(simulate([[0, 60], [300, 340]]), { likes: 0, opens: 2 }); });
test("window always leaves room for a second press after the delay", () => {
  assert.equal(doubleTapWindow(), 300); assert.equal(doubleTapWindow(0), 300); assert.equal(doubleTapWindow(400), 540);
});
test("?tap parsing: clamp 0..400, ignore invalid", () => {
  assert.equal(parseTapDelay("?tap=100"), 100); assert.equal(parseTapDelay("?tap=0"), 0); assert.equal(parseTapDelay("?a=1&tap=999"), 400);
  for (const bad of ["", "?tap=", "?tap=abc", "?tap=-5", "?tap=1e3", "?tap=NaN", "?tap=12px"]) assert.equal(parseTapDelay(bad), null, bad);
});
test("detail view: double tap toggles like via the same recogniser, single tap does nothing", () => {
  const g = new ProductGesture(); let liked = false; const press = (t: number) => { g.down("sheet", t, 5, 5); if (g.up(t + 40) === "like") liked = !liked; };
  press(0); assert.equal(liked, false);          // single tap: no like, nothing delayed
  press(150); assert.equal(liked, true);
  press(1000); press(1150); assert.equal(liked, false);
});

test("feed double tap: liked piece only replays the animation, unliked piece is liked", () => {
  assert.equal(feedDoubleTap(true), "replay");
  assert.equal(feedDoubleTap(false), "like");
});
