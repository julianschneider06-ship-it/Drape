import test from "node:test";
import assert from "node:assert/strict";
import { decideAxis, sheetCloseSwipe, swapOnRelease } from "../src/lib/gestures";

test("axis stays open below the lock distance", () => assert.equal(decideAxis(5, 3), null));
test("horizontal wins with generous tolerance", () => { assert.equal(decideAxis(10, 8), "x"); assert.equal(decideAxis(-12, 4), "x"); });
test("clearly vertical scrolls the outfit", () => { assert.equal(decideAxis(4, 14), "y"); assert.equal(decideAxis(8, -12), "y"); });
test("swap: far drag", () => assert.equal(swapOnRelease(30, 600), true));
test("swap: short fast flick", () => assert.equal(swapOnRelease(-18, 40), true));
test("no swap: short slow drag", () => assert.equal(swapOnRelease(18, 400), false));
test("no swap: tiny move", () => assert.equal(swapOnRelease(5, 10), false));
test("sheet closes on a clear downward swipe", () => {
  assert.equal(sheetCloseSwipe(0, 45, 300, 0, false), true);
  assert.equal(sheetCloseSwipe(0, 20, 300, 0, false), false);
  assert.equal(sheetCloseSwipe(0, -60, 100, 0, false), false);
  assert.equal(sheetCloseSwipe(50, 45, 300, 0, false), false);
});
test("sheet closes on a short fast flick", () => {
  assert.equal(sheetCloseSwipe(0, 20, 20, 0, false), true);
  assert.equal(sheetCloseSwipe(0, 20, 200, 0, false), false);
  assert.equal(sheetCloseSwipe(0, 10, 5, 0, false), false);
});
test("sheet: scrolled content wins unless on handle / image", () => {
  assert.equal(sheetCloseSwipe(0, 60, 200, 40, false), false);
  assert.equal(sheetCloseSwipe(0, 60, 200, 40, true), true);
});

