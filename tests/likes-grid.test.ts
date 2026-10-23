import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fieldsFor, gridIconCols, gridLabel, nextCols, parseCols } from "../src/lib/likes-grid";

test("cycle order 2 -> 3 -> 4 -> 2", () => {
  assert.equal(nextCols(2), 3); assert.equal(nextCols(3), 4); assert.equal(nextCols(4), 2);
});
test("invalid stored value falls back to 2", () => {
  for (const v of [null, undefined, "", "abc", "5", "1", "0", "2.5"]) assert.equal(parseCols(v), 2);
  assert.equal(parseCols("3"), 3); assert.equal(parseCols("4"), 4);
});
test("fields per mode", () => {
  assert.deepEqual(fieldsFor(2), { brand: true, name: true, oldPrice: true });
  assert.deepEqual(fieldsFor(3), { brand: true, name: false, oldPrice: true });
  assert.deepEqual(fieldsFor(4), { brand: false, name: false, oldPrice: false });
});

test("grid button shows the CURRENT mode", () => {
  assert.equal(gridIconCols(2), 2); assert.equal(gridIconCols(3), 3); assert.equal(gridIconCols(4), 4); assert.equal(gridIconCols(9), 2);
  assert.equal(gridLabel(3), "Grid density, 3 columns");
  assert.equal(gridLabel(4), "Grid density, 4 columns");
  assert.equal(gridLabel(2), "Grid density, 2 columns");
});
test("the shop link exists only in the product sheet, not in the list", () => {
  assert.ok(!("link" in fieldsFor(2)));
  const list = readFileSync("src/components/LikesView.tsx", "utf8"), sheet = readFileSync("src/components/ProductSheet.tsx", "utf8");
  assert.ok(!list.includes("outHref") && !list.includes("View product") && !list.includes("aw_deep_link"));
  assert.ok(sheet.includes("outHref(card.id, \"detail\"") && sheet.includes("View product"));
});
