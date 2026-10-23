import { test } from "node:test";
import assert from "node:assert/strict";
import { fieldsFor, nextCols, parseCols } from "../src/lib/likes-grid";

test("cycle order 2 -> 3 -> 4 -> 2", () => {
  assert.equal(nextCols(2), 3); assert.equal(nextCols(3), 4); assert.equal(nextCols(4), 2);
});
test("invalid stored value falls back to 2", () => {
  for (const v of [null, undefined, "", "abc", "5", "1", "0", "2.5"]) assert.equal(parseCols(v), 2);
  assert.equal(parseCols("3"), 3); assert.equal(parseCols("4"), 4);
});
test("fields per mode", () => {
  assert.deepEqual(fieldsFor(2), { brand: true, name: true, link: true, oldPrice: true });
  assert.deepEqual(fieldsFor(3), { brand: true, name: false, link: false, oldPrice: true });
  assert.deepEqual(fieldsFor(4), { brand: false, name: false, link: false, oldPrice: false });
});
