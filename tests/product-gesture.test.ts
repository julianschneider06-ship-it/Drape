import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductGesture } from "../src/lib/product-gesture";
import { DOUBLE_TAP_MS, GESTURE_MOVE_PX } from "../src/config/product-gesture";
import { RAIL_HEART } from "../src/config/action-rail";

const tap = (g: ProductGesture, key: string, t: number, x = 10, y = 10) => { g.down(key, t, x, y); return g.up(t + 40); };

test("config values", () => {
  assert.equal(DOUBLE_TAP_MS, 300);
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
  assert.equal(tap(g, "a", 40 + DOUBLE_TAP_MS + 10), "tap");
  assert.equal(tap(g, "b", 40 + DOUBLE_TAP_MS + 100), "tap");
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
