import { test } from "node:test";
import assert from "node:assert/strict";
import { STRIPE_BG as C } from "../src/config/stripe-bg";
import { COLOR_HEX } from "../src/lib/shine";
import { DEFAULT_PREFS, cleanPrefs } from "../src/lib/shop-pref";
import { effectiveStripe, gradientCss, isNeutral, normalizeColor, outfitColorNames, bendPaths, glassPieceStyle, specularCss, stripeCss, stripePalette, toHsl } from "../src/lib/stripe-bg";

const card = (col: string | null) => ({ id: 1, mq: { sub: null, col, fit: null, sil: null, outer: false } }) as never;
const outfit = (cols: (string | null)[], acc: (string | null)[] = []) => ({ top: card(cols[0]), bottom: card(cols[1]), shoes: card(cols[2]), accessories: acc.map((c) => ({ type: "bag", card: card(c) })) }) as never;

test("config values are sane", () => {
  assert.ok(C.periodPx > 0 && C.stops[0].pos === 0 && C.stops[C.stops.length - 1].pos === 100);
  assert.ok(C.stops.every((s, i) => i === 0 || s.pos > C.stops[i - 1].pos) && C.stops.every((s) => s.a >= 0 && s.a <= 0.25));
  assert.ok(C.stops[0].a === 0 && C.stops[C.stops.length - 1].a === 0);
  assert.ok(C.bend.zoneHeightPx >= 60 && C.bend.zoneHeightPx <= 100 && C.bend.minRadiusPx + C.bend.groupSpanPx <= C.bend.zoneHeightPx && C.bend.fadeFromPx < C.bend.fadeToPx && C.bend.fadeToPx <= C.bend.zoneHeightPx);
  assert.ok(C.glass.radiusPx <= 16 && C.glass.marginPx > 0 && C.glass.stripeBoost >= 1);
  assert.ok(C.minColors === 2 && C.maxColors === 3 && C.blobs.length >= C.maxColors);
  assert.ok(C.lightnessMin < C.lightnessMax && C.saturationMin <= C.saturationMax && C.crossfadeMs > 0);
  assert.match(C.fallbackColor, /^#[0-9a-f]{6}$/);
});

test("colour names: first colour per product, unknown and multicolor give no vote", () => {
  assert.deepEqual(outfitColorNames(outfit(["red", "navy", null], ["red", "multicolor"])), ["red", "navy", "red"]);
});

test("palette: most frequent first, ties by order, at most maxColors", () => {
  assert.deepEqual(stripePalette(["blue", "red", "red", "green", "pink"]).length, 3);
  const [first] = stripePalette(["blue", "red", "red"]);
  assert.equal(first, normalizeColor(COLOR_HEX.red));
  assert.equal(stripePalette(["blue", "red"])[0], normalizeColor(COLOR_HEX.blue));   // tie: appearance order
});

test("normalisation: dark is lightened, very light is lowered and tinted, hue is kept, saturation limited", () => {
  const dark = toHsl(normalizeColor(COLOR_HEX.navy));
  assert.ok(dark.l >= C.lightnessMin - 0.01 && Math.abs(dark.h - toHsl(COLOR_HEX.navy).h) < 4);
  const light = toHsl(normalizeColor("#f7efd8"));
  assert.ok(light.l <= C.lightnessMax + 0.01 && light.s >= C.tintMinSaturation - 0.02);
  const vivid = toHsl(normalizeColor(COLOR_HEX.red));
  assert.ok(vivid.s <= C.saturationMax + 0.02 && vivid.s >= C.saturationMin - 0.02);
});

test("neutrals are dropped; with one clear colour the rest is the fallback; none = all fallback", () => {
  for (const n of ["black", "white", "grey", "silver"]) assert.ok(isNeutral(COLOR_HEX[n]), n);
  assert.deepEqual(stripePalette(["black", "grey", "white"]), [C.fallbackColor, C.fallbackColor]);
  assert.deepEqual(stripePalette([]), [C.fallbackColor, C.fallbackColor]);
  assert.deepEqual(stripePalette(["black", "pink", "pink"]), [normalizeColor(COLOR_HEX.pink), C.fallbackColor]);
});

test("neutrals can be softened instead of dropped", () => {
  const p = stripePalette(["grey", "red"], { ...C, dropNeutrals: false } as unknown as typeof C);
  assert.equal(p.length, 2);
  assert.notEqual(p[0], COLOR_HEX.grey);
});

test("css strings use the config", () => {
  const s = stripeCss();
  assert.ok(s.startsWith("repeating-linear-gradient(90deg") && s.includes(`${C.periodPx}px`) && !s.includes("blur"));
  assert.ok(!stripeCss({ ...C, secondEnabled: false } as unknown as typeof C).includes(`${+(C.periodPx * C.secondPeriodMult).toFixed(3)}px`));
  assert.ok(!stripeCss().includes("blur") && specularCss().includes(`${C.specular.angleDeg}deg`));
  const gs = glassPieceStyle();
  assert.ok(String(gs.background).includes(C.glass.fill) && String(gs.boxShadow).includes(C.glass.edge) && gs.borderRadius === C.glass.radiusPx);
  assert.notEqual(stripeCss(C, C.glass.stripeBoost, C.glass.stripeShiftPx), stripeCss());
  const g = gradientCss(["#aabbcc", "#ddeeff"]);
  assert.ok(g.includes("#aabbcc") && g.includes(`${C.angleDeg}deg`) && g.endsWith(C.baseColor));
});

test("switch: default off, link wins, old saves stay valid", () => {
  assert.equal(DEFAULT_PREFS.stripe, false);
  assert.equal(effectiveStripe(null, false), false);
  assert.equal(effectiveStripe(null, true), true);
  assert.equal(effectiveStripe("1", false), true);
  assert.equal(effectiveStripe("0", true), false);
  assert.equal(effectiveStripe("x", true), true);
  assert.equal(cleanPrefs({ v: 1, stripe: true }).stripe, true);
  assert.equal(cleanPrefs({ v: 1, stripe: "yes" }).stripe, false);
  assert.equal(cleanPrefs({ v: 1, season: false }).stripe, false);
});

test("floor bend: concentric inside a group, radius grows with the stripe, everything fits the zone", () => {
  const paths = bendPaths(390);
  assert.ok(paths.length >= C.stops.length - 2);
  const rs = [...paths[0].d.matchAll(/A([\d.]+) /g)].map((m) => +m[1]);
  assert.ok(rs.every((r) => r >= C.bend.minRadiusPx - 0.01 && r <= C.bend.minRadiusPx + C.bend.groupSpanPx + 0.01 && r <= C.bend.zoneHeightPx));
  assert.ok(new Set(rs.map((r) => Math.round(r))).size > 1);
  // first stripe: straight down from y 0, quarter circle (sweep 1) to the left, then a horizontal run
  assert.match(paths[0].d, /^M[\d.]+ 0V0A[\d.]+ [\d.]+ 0 0 1 [-\d.]+ [\d.]+H[-\d.]+/);
});
