import { test } from "node:test";
import assert from "node:assert/strict";
import { JEWELRY_SCALE, jewelryScale } from "../src/config/jewelry";

test("jewelry scale: watch 1.10, ring 1.50, necklace and chain 1.25, bracelet 1.00", () => {
  assert.equal(jewelryScale("watch"), 1.1);
  assert.equal(jewelryScale("ring"), 1.5);
  assert.equal(jewelryScale("necklace"), 1.25);
  assert.equal(jewelryScale("chain"), 1.25);
  assert.equal(JEWELRY_SCALE.bracelet, 1);
});
test("jewelry scale: everything else is untouched", () => {
  for (const t of ["shoes", "bag", "sunglasses", "earrings", "belt", "hat", "other_wearable", "top"]) assert.equal(jewelryScale(t), 1);
});
