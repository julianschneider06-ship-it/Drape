import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilter, chipsFor, effectiveFilter, groupOf } from "../src/lib/likes-filter";

test("slots map to groups, unmapped goes to accessories", () => {
  assert.equal(groupOf("top"), "tops"); assert.equal(groupOf("full_body"), "tops");
  assert.equal(groupOf("bottom"), "bottoms"); assert.equal(groupOf("shoes"), "shoes");
  assert.equal(groupOf("accessory"), "accessories"); assert.equal(groupOf("none"), "accessories");
  assert.equal(groupOf("weird"), "accessories"); assert.equal(groupOf(null), "accessories");
});
test("chips: All always, groups only when present", () => {
  assert.deepEqual(chipsFor([]).map((c) => c.id), ["all"]);
  assert.deepEqual(chipsFor([{ slot: "shoes" }, { slot: "top" }, { slot: "top" }]).map((c) => c.id), ["all", "tops", "shoes"]);
});
test("filter falls back to All when its group is empty; apply filters the list", () => {
  const items = [{ slot: "top" }, { slot: "shoes" }];
  assert.equal(effectiveFilter("shoes", items), "shoes");
  assert.equal(effectiveFilter("bottoms", items), "all");
  assert.equal(effectiveFilter("tops", []), "all");
  assert.equal(applyFilter(items, "shoes").length, 1); assert.equal(applyFilter(items, "all").length, 2);
});
