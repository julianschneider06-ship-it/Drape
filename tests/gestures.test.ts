import test from "node:test";
import assert from "node:assert/strict";
import { decideAxis, blockTouchMove, sheetDrag, swapOnRelease } from "../src/lib/gestures";

test("axis stays open below the lock distance", () => assert.equal(decideAxis(5, 3), null));
test("horizontal wins with generous tolerance", () => { assert.equal(decideAxis(10, 8), "x"); assert.equal(decideAxis(-12, 4), "x"); });
test("clearly vertical scrolls the outfit", () => { assert.equal(decideAxis(4, 14), "y"); assert.equal(decideAxis(8, -12), "y"); });
test("swap: far drag", () => assert.equal(swapOnRelease(30, 600), true));
test("swap: short fast flick", () => assert.equal(swapOnRelease(-18, 40), true));
test("no swap: short slow drag", () => assert.equal(swapOnRelease(18, 400), false));
test("no swap: tiny move", () => assert.equal(swapOnRelease(5, 10), false));
const H = 500;
test("sheet follows a small downward drag 1:1", () => assert.deepEqual(sheetDrag(0, 30, 400, 0, false, H), { offset: 30, action: "follow" }));
test("sheet: below the ratio it only follows (release springs back)", () => assert.equal(sheetDrag(0, 49, 800, 0, false, H).action, "follow"));
test("sheet: commits at the ratio of the sheet height", () => {
  assert.equal(sheetDrag(0, 50, 800, 0, false, H).action, "commit");
  assert.equal(sheetDrag(0, 50, 800, 0, false, 1000).action, "follow");
});
test("sheet: a fast flick commits below the ratio", () => {
  assert.equal(sheetDrag(0, 20, 20, 0, false, H).action, "commit");
  assert.equal(sheetDrag(0, 10, 5, 0, false, H).action, "follow");
});
test("sheet: upward or sideways drags never move it", () => {
  assert.deepEqual(sheetDrag(0, -60, 100, 0, false, H), { offset: 0, action: "ignore" });
  assert.equal(sheetDrag(50, 45, 300, 0, false, H).action, "ignore");
});
test("sheet: scrolled content wins unless on handle / image", () => {
  assert.equal(sheetDrag(0, 60, 200, 40, false, H).action, "ignore");
  assert.equal(sheetDrag(0, 60, 200, 40, true, H).action, "commit");
});
test("touchmove: outside the panel or in a non-scrollable panel is always blocked", () => {
  assert.equal(blockTouchMove(false, true, 10, 100, 5), true);
  assert.equal(blockTouchMove(true, false, 0, 0, 5), true);
});
test("touchmove: scrollable panel scrolls until its edges, no chaining", () => {
  assert.equal(blockTouchMove(true, true, 20, 100, 5), false);   // finger down, not at top
  assert.equal(blockTouchMove(true, true, 0, 100, 5), true);     // at top: would chain to the feed
  assert.equal(blockTouchMove(true, true, 100, 100, -5), true);  // at bottom, finger up
  assert.equal(blockTouchMove(true, true, 50, 100, -5), false);
});
