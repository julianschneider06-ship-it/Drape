import { test } from "node:test";
import assert from "node:assert/strict";
import { DURATION_MS, HEART, LIKE_POP, SPRING, REDUCED_MOTION_QUERY } from "../src/config/motion";
import { heartPlan, likeEvent, heartFillTransition, likePopTotalMs } from "../src/lib/heart-motion";

test("motion config has all tokens", () => {
  for (const k of ["press", "pop", "settle"] as const) { assert.equal(SPRING[k].type, "spring"); assert.ok(SPRING[k].stiffness > 0 && SPRING[k].damping > 0); }
  assert.ok(HEART.pressScale < 1 && HEART.popScale > 1);
  assert.ok(LIKE_POP.startScale < 1 && LIKE_POP.peakScale > 1 && LIKE_POP.pieceImpulse > 1 && LIKE_POP.driftPx < 0);
  assert.equal(DURATION_MS.fill, 200);
  assert.match(REDUCED_MOTION_QUERY, /prefers-reduced-motion/);
});

test("heart plan: press, pop on like, no pop on unlike/release", () => {
  assert.deepEqual(heartPlan("press", false).map((s) => s.scale), [HEART.pressScale]);
  assert.deepEqual(heartPlan("like", false).map((s) => s.scale), [HEART.popScale, 1]);
  assert.deepEqual(heartPlan("unlike", false).map((s) => s.scale), [1]);
  assert.deepEqual(heartPlan("release", false).map((s) => s.scale), [1]);
});

test("reduced motion: no scale steps, shorter colour fade", () => {
  for (const e of ["press", "release", "like", "unlike"] as const) assert.equal(heartPlan(e, true).length, 0);
  assert.match(heartFillTransition(true), /0\.12s/);
  assert.match(heartFillTransition(false), /0\.2s/);
  assert.equal(likePopTotalMs(true, true), DURATION_MS.reducedFade * 2);
  assert.equal(likePopTotalMs(true, false), 600);
});

test("like event only on a real state change", () => {
  assert.equal(likeEvent(false, true), "like");
  assert.equal(likeEvent(true, false), "unlike");
  assert.equal(likeEvent(true, true), null);
});
