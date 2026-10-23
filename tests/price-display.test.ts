import test from "node:test";
import assert from "node:assert/strict";
import { priceDisplay } from "../src/lib/price-display";

test("sale: now + was; no sale: only now; marker off: only now; missing original: only now", () => {
  assert.deepEqual(priceDisplay({ price_cents: 5000, compare_at_cents: 8000 }, true), { now: 5000, was: 8000 });
  assert.deepEqual(priceDisplay({ price_cents: 8000, compare_at_cents: 8000 }, true), { now: 8000, was: null });
  assert.deepEqual(priceDisplay({ price_cents: 5000, compare_at_cents: 8000 }, false), { now: 5000, was: null });
  assert.deepEqual(priceDisplay({ price_cents: 5000, compare_at_cents: null }, true), { now: 5000, was: null });
  assert.deepEqual(priceDisplay({ price_cents: null, compare_at_cents: 8000 }, true), { now: null, was: null });
});
