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

import { MENU, MENU_COLORS, SHEET, DISABLED_OPACITY } from "../src/config/motion";
import { fadeSlide, layerFade, pressProps, sheetMotion, staggerDelay, stateTransition } from "../src/lib/menu-motion";
import { tabLayers } from "../src/lib/nav-tabs";

test("menu tokens have the agreed shape", () => {
  for (const k of ["menu", "pill", "sheet"] as const) { assert.equal(SPRING[k].type, "spring"); assert.ok(SPRING[k].stiffness > 0 && SPRING[k].damping > 0); }
  assert.ok(MENU.pressScale < 1 && MENU.pressScale > 0.8 && MENU.chipPress < 1);
  assert.ok(MENU.tabShiftPx <= 8 && MENU.itemShiftPx >= 8 && MENU.itemShiftPx <= 12);
  assert.ok(MENU.staggerMs >= 20 && MENU.staggerMs <= 30 && MENU.staggerCapMs >= MENU.staggerMs);
  assert.ok(SHEET.enterY > SHEET.exitY && SHEET.enterScale < 1);
  assert.ok(DISABLED_OPACITY > 0 && DISABLED_OPACITY < 1);
  for (const k of ["tabOut", "menuOut", "sheetOut", "backdropOut"] as const) assert.ok(DURATION_MS[k] < 250, k);
  assert.ok(DURATION_MS.sheetOut < DURATION_MS.tabIn + 100 && String(MENU_COLORS.nav.on) !== String(MENU_COLORS.nav.off));
});

test("stagger is 25 ms per item and capped", () => {
  assert.equal(staggerDelay(0, false), 0);
  assert.equal(staggerDelay(2, false), 0.05);
  assert.equal(staggerDelay(50, false), MENU.staggerCapMs / 1000);
  assert.equal(staggerDelay(5, true), 0);
});

test("reduced motion: opacity only, no slide, no press scale, short fade", () => {
  const r = fadeSlide(true), n = fadeSlide(false);
  assert.equal(r.initial.y, 0); assert.equal(n.initial.y, MENU.itemShiftPx);
  assert.deepEqual(r.transition, { duration: DURATION_MS.reducedFade / 1000 });
  assert.deepEqual(pressProps(true, MENU.pressScale), {});
  assert.equal(pressProps(false, MENU.pressScale).whileTap?.scale, MENU.pressScale);
  assert.equal("scale" in stateTransition(true), false);
  const sh = sheetMotion(true);
  assert.equal(sh.panel.initial.y, 0); assert.equal(sh.panel.initial.scale, 1);
  assert.equal(sh.panel.exit.transition.duration, DURATION_MS.reducedFade / 1000);
  const sm = sheetMotion(false);
  assert.equal(sm.panel.initial.y, SHEET.enterY);
  assert.ok(sm.panel.exit.transition.duration < sm.backdrop.animate.transition.duration + 0.1);
  assert.deepEqual(layerFade(true, true).from, 0);
  assert.equal(layerFade(true, false).from, MENU.tabShiftPx);
  assert.equal(layerFade(false, false).hideAfterMs, DURATION_MS.tabOut);
  assert.equal(layerFade(true, false).hideAfterMs, 0);
});

test("tab switching keeps Search mounted (its selection, results and scroll survive); Wishlist only while open", () => {
  let seen = false;
  const step = (t: "foryou" | "search" | "likes") => { const l = tabLayers(t, seen); if (l.searchActive) seen = true; return l; };
  assert.equal(step("foryou").searchMounted, false);
  assert.equal(step("search").searchMounted, true);
  for (const t of ["likes", "foryou", "likes", "foryou"] as const) { const l = step(t); assert.equal(l.searchMounted, true); assert.equal(l.searchActive, false); assert.equal(l.wishlistOpen, t === "likes"); assert.equal(l.feedActive, t === "foryou"); }
  assert.equal(step("search").searchActive, true);
});
