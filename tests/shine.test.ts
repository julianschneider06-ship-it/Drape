import { test } from "node:test";
import assert from "node:assert/strict";
import { SHINE } from "../src/config/search";
import { contrastOnWhite, shineColor, shineOn, shineStrokes } from "../src/lib/shine";

test("?shine=0 turns the strokes off, anything else keeps them on", () => {
  assert.equal(shineOn("?shine=0"), false);
  assert.equal(shineOn("?feed=base&shine=0"), false);
  assert.equal(shineOn(""), true);
  assert.equal(shineOn("?shine=1"), true);
});

test("light colours are darkened to the minimum contrast, dark ones stay", () => {
  for (const n of ["white", "cream", "beige", "pink", "yellow", "silver"]) assert.ok(contrastOnWhite(shineColor(n, false)) >= SHINE.minContrast - 0.01, n);
  assert.notEqual(shineColor("cream", false), "#f3ead3");
  assert.equal(shineColor("navy", false), "#1f2a55");
});

test("red-like colour on a sale piece falls back to grey, other colours keep theirs", () => {
  for (const n of ["red", "burgundy", "pink"]) assert.equal(shineColor(n, true), SHINE.fallback, n);
  assert.notEqual(shineColor("red", false), SHINE.fallback);
  assert.equal(shineColor("navy", true), "#1f2a55");
});

test("missing or unusable colour falls back to grey", () => {
  for (const n of [null, undefined, "", "multicolor", "nonsense"]) assert.equal(shineColor(n, false), SHINE.fallback);
});

test("strokes: configured count, deterministic, outside the box and further out with a sale outline", () => {
  const a = shineStrokes(100, 160, 42, false), b = shineStrokes(100, 160, 42, false), s = shineStrokes(100, 160, 42, true);
  assert.equal(a.length, SHINE.count);
  assert.deepEqual(a, b);
  const first = (p: string) => p.slice(1).split("Q")[0].split(" ").map(Number);
  for (const p of a) { const [x, y] = first(p); assert.ok(x < 0 || x > 100 || y < 0 || y > 160); }
  assert.notDeepEqual(a, s);
});
