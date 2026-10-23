import test from "node:test";
import assert from "node:assert/strict";
import { decideAxis, sheetDismiss, sheetDragStarts, swapOnRelease } from "../src/lib/gestures";

test("axis stays open below the lock distance", () => assert.equal(decideAxis(5, 3), null));
test("horizontal wins with generous tolerance", () => { assert.equal(decideAxis(10, 8), "x"); assert.equal(decideAxis(-12, 4), "x"); });
test("clearly vertical scrolls the outfit", () => { assert.equal(decideAxis(4, 14), "y"); assert.equal(decideAxis(8, -12), "y"); });
test("swap: far drag", () => assert.equal(swapOnRelease(30, 600), true));
test("swap: short fast flick", () => assert.equal(swapOnRelease(-18, 40), true));
test("no swap: short slow drag", () => assert.equal(swapOnRelease(18, 400), false));
test("no swap: tiny move", () => assert.equal(swapOnRelease(5, 10), false));
test("sheet drag starts only downward and vertical", () => {
  assert.equal(sheetDragStarts(0, 12, 0, false), true);
  assert.equal(sheetDragStarts(0, -12, 0, false), false);
  assert.equal(sheetDragStarts(14, 10, 0, false), false);
});
test("sheet drag: scrolled content wins unless on handle / image", () => {
  assert.equal(sheetDragStarts(0, 12, 40, false), false);
  assert.equal(sheetDragStarts(0, 12, 40, true), true);
});
test("sheet dismiss by distance, by flick, else springs back", () => {
  assert.equal(sheetDismiss(260, 1000, 0), true);
  assert.equal(sheetDismiss(60, 1000, 0.8), true);
  assert.equal(sheetDismiss(100, 1000, 0.1), false);
  assert.equal(sheetDismiss(-300, 1000, 2), false);
});
