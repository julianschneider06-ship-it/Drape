import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductGesture } from "../src/lib/product-gesture";
import { DOUBLE_TAP_MS, GESTURE_MOVE_PX, LONG_PRESS_MS } from "../src/config/product-gesture";
import { RAIL_HEART } from "../src/config/action-rail";

const tap = (g: ProductGesture, key: string, t: number, x = 10, y = 10) => { g.down(key, t, x, y); return g.up(t + 40); };

test("config values", () => {
  assert.equal(LONG_PRESS_MS, 450); assert.equal(DOUBLE_TAP_MS, 300);
  assert.equal(RAIL_HEART.restFill, "#ffffff"); assert.notEqual(RAIL_HEART.likedFill, RAIL_HEART.restFill);
});
test("single tap does nothing", () => { assert.equal(tap(new ProductGesture(), "a", 0), null); });
test("double tap likes, third tap starts over", () => {
  const g = new ProductGesture();
  assert.equal(tap(g, "a", 0), null);
  assert.equal(tap(g, "a", 150), "like");
  assert.equal(tap(g, "a", 300), null);   // no double trigger on a quick third tap
  assert.equal(tap(g, "a", 450), "like");
});
test("two taps too far apart or on different pieces are no double tap", () => {
  const g = new ProductGesture();
  tap(g, "a", 0);
  assert.equal(tap(g, "a", 40 + DOUBLE_TAP_MS + 10), null);
  assert.equal(tap(g, "b", 40 + DOUBLE_TAP_MS + 100), null);
  const h = new ProductGesture(); tap(h, "a", 0, 10, 10);
  assert.equal(tap(h, "a", 100, 200, 200), null);
});
test("long press opens, the release does nothing and no double tap follows", () => {
  const g = new ProductGesture();
  g.down("a", 0, 5, 5);
  assert.equal(g.longPress(), "open");
  assert.equal(g.up(500), null);
  assert.equal(tap(g, "a", 600), null);   // first tap of a fresh pair
});
test("long press after a first tap does not also like", () => {
  const g = new ProductGesture();
  tap(g, "a", 0);
  g.down("a", 100, 10, 10);
  assert.equal(g.longPress(), "open");
  assert.equal(g.up(600), null);
});
test("movement cancels long press and tap (scroll / swipe)", () => {
  const g = new ProductGesture();
  g.down("a", 0, 5, 5);
  assert.equal(g.move(5, 5 + GESTURE_MOVE_PX), false);   // within tolerance
  assert.equal(g.move(5, 5 + GESTURE_MOVE_PX + 2), true);
  assert.equal(g.longPress(), null);
  assert.equal(g.up(100), null);
  assert.equal(tap(g, "a", 150), null);   // the drag did not count as first tap
});
test("cancel (pointercancel) drops the press", () => {
  const g = new ProductGesture();
  tap(g, "a", 0);
  g.down("a", 100, 10, 10); g.cancel();
  assert.equal(g.up(140), null);
});
