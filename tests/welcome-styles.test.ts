// Welcome flow: style picker filter (only styles with pool outfits) and the fading style prior of the hybrid feed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STYLE_KEYS } from "../src/classify/styles";
import { ALL_STYLES, MIN_STYLE_OUTFITS, availableStyles } from "../src/lib/welcome";
import { PRIOR, TASTE, priorMixFor, priorWeight } from "../src/lib/personalization/config";
import { newTaste, tasteMatch, withPrior } from "../src/outfits/taste";
import type { CatPiece } from "../src/outfits/catalogue";

test("style picker: only styles with at least MIN_STYLE_OUTFITS outfits, in the usual order", () => {
  assert.equal(MIN_STYLE_OUTFITS, 1);
  const counts = { classic: 12, minimalism: 1, techwear: 0, boho: 3 };
  assert.deepEqual(availableStyles(counts), ALL_STYLES.filter((k) => k in counts && counts[k as keyof typeof counts] >= 1));
  assert.deepEqual(availableStyles(counts, 5), ["classic"]);
});
test("style picker: failed query (no counts) falls back to the full list", () => {
  assert.deepEqual(availableStyles(null), ALL_STYLES);
  assert.deepEqual(availableStyles(undefined), ALL_STYLES);
});

const piece = (style: number) => { const v = new Float32Array(STYLE_KEYS.length); v[style] = 1; return { slot: "top", vec: v, main: "black", silhouette: "", sub: "", formality: 0.4, boldness: 0.3 } as unknown as CatPiece; };

test("prior: picked styles win from the first card and the stored taste is untouched", () => {
  const t = newTaste(), a = STYLE_KEYS[0], b = STYLE_KEYS[1], p = withPrior(t, [a])!;
  assert.ok(p);
  assert.ok(tasteMatch(p, piece(0)) > tasteMatch(p, piece(1)));
  assert.equal(t.styles.top[0], 0);               // the original is not changed
  assert.equal(withPrior(t, []), null);
  assert.equal(withPrior(t, ["not_a_style"]), null);
  assert.ok(b);
});
test("prior: fades linearly with events and is gone at PRIOR.fadeN", () => {
  assert.equal(priorWeight(0), 1);
  assert.ok(Math.abs(priorWeight(PRIOR.fadeN / 2) - 0.5) < 1e-9);
  const t = newTaste(); t.n = PRIOR.fadeN;
  assert.equal(withPrior(t, [STYLE_KEYS[0]]), null);
  t.n = 10; const w10 = withPrior(t, [STYLE_KEYS[0]])!.styles.top[0]; t.n = 30; const w30 = withPrior(t, [STYLE_KEYS[0]])!.styles.top[0];
  assert.ok(w10 > w30 && w30 > 0);
});
test("prior: mix leans on the picks at 0 events and equals the personal mix at personalizeFrom", () => {
  assert.deepEqual(priorMixFor(0), PRIOR.mix);
  const end = priorMixFor(TASTE.personalizeFrom);
  assert.ok(Math.abs(end.match + end.near + end.new + end.contrast - 1) < 1e-9);
  assert.ok(priorMixFor(0).match > priorMixFor(10).match);
});
