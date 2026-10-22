import { test } from "node:test";
import assert from "node:assert/strict";
import { boxLeft, boxSpan } from "../src/lib/tutorial-layout";
import { ACTION_RAIL_WIDTH } from "../src/config/action-rail";
import { LAYOUT_SAFE_MARGIN } from "../src/config/layout-safe";

test("tutorial boxes stay inside the safe margin and clear of the heart on small iPhones", () => {
  for (const vw of [360, 390]) {
    const { w } = boxSpan(vw);
    for (const cx of [0, vw / 2, vw]) for (const dx of [0, 60]) {
      const l = boxLeft(cx, vw, w, dx);
      assert.ok(l >= LAYOUT_SAFE_MARGIN.left, `left ${vw}`);
      assert.ok(l + w <= vw - ACTION_RAIL_WIDTH, `right ${vw}`);
    }
  }
});
