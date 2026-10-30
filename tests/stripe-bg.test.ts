import { test } from "node:test";
import assert from "node:assert/strict";
import { STRIPE_BG as C } from "../src/config/stripe-bg";
import { COLOR_HEX } from "../src/lib/shine";
import { DEFAULT_PREFS, cleanPrefs } from "../src/lib/shop-pref";
import { effectiveStripe, gradientCss, isNeutral, normalizeColor, outfitColorNames, curveSlices, glassPieceStyle, glassFill, simpleBackgroundCss, simpleStripeCss, productShadowCss, productImprintCss, specularCss, stripeCss, stripePalette, toHsl } from "../src/lib/stripe-bg";

const card = (col: string | null) => ({ id: 1, mq: { sub: null, col, fit: null, sil: null, outer: false } }) as never;
const outfit = (cols: (string | null)[], acc: (string | null)[] = []) => ({ top: card(cols[0]), bottom: card(cols[1]), shoes: card(cols[2]), accessories: acc.map((c) => ({ type: "bag", card: card(c) })) }) as never;

test("config values are sane", () => {
  assert.ok(C.periodPx > 0 && C.stops[0].pos === 0 && C.stops[C.stops.length - 1].pos === 100);
  assert.ok(C.stops.every((s, i) => i === 0 || s.pos > C.stops[i - 1].pos) && C.stops.every((s) => s.a >= 0 && s.a <= 0.25));
  assert.ok(C.stops[0].a === 0 && C.stops[C.stops.length - 1].a === 0);
  assert.ok(C.curve.zonePx >= 20 && C.curve.zonePx <= 30 && C.curve.maxDeg > 0 && C.curve.maxDeg <= 5 && C.curve.slices >= 2);
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
  assert.ok(String(gs.background).includes(glassFill("colorful")) && String(gs.boxShadow).includes(C.glass.edge) && gs.borderRadius === C.glass.radiusPx);
  assert.notEqual(stripeCss(C, C.glass.stripeBoost, C.glass.stripeShiftPx), stripeCss());
  const g = gradientCss(["#aabbcc", "#ddeeff"]);
  assert.ok(g.includes("#aabbcc") && g.includes(`${C.angleDeg}deg`) && g.endsWith(C.baseColor));
});

test("three-state switch: default off, link wins (0 | 1 | simple), old saves stay valid", () => {
  assert.equal(DEFAULT_PREFS.stripe, "off");
  assert.equal(effectiveStripe(null, "off"), "off");
  assert.equal(effectiveStripe(null, "colorful"), "colorful");
  assert.equal(effectiveStripe(null, "simple"), "simple");
  assert.equal(effectiveStripe("1", "off"), "colorful");   // old link keeps working: 1 = Colorful
  assert.equal(effectiveStripe("0", "simple"), "off");
  assert.equal(effectiveStripe("simple", "off"), "simple");
  assert.equal(effectiveStripe("x", "simple"), "simple");
  assert.equal(cleanPrefs({ v: 1, stripe: true }).stripe, "colorful");   // old boolean saves
  assert.equal(cleanPrefs({ v: 1, stripe: false }).stripe, "off");
  assert.equal(cleanPrefs({ v: 1, stripe: "colorful" }).stripe, "colorful");
  assert.equal(cleanPrefs({ v: 1, stripe: "simple" }).stripe, "simple");
  assert.equal(cleanPrefs({ v: 1, stripe: "yes" }).stripe, "off");
  assert.equal(cleanPrefs({ v: 1, season: false }).stripe, "off");
});

test("shared glass translucency: header and tab bar use one style function, same alpha in both modes", () => {
  assert.ok(C.glass.fillAlpha > 0.2 && C.glass.fillAlpha < 0.8);
  for (const m of ["colorful", "simple"] as const) assert.ok(glassFill(m).endsWith(`,${C.glass.fillAlpha})`) && String(glassPieceStyle(m).background).includes(glassFill(m)));
  assert.notEqual(glassFill("colorful"), glassFill("simple"));
  const lum = (rgb: string) => rgb.split(",").reduce((t, v) => t + Number(v), 0);
  assert.ok(lum(C.simple.glassRgb) > lum(C.glass.rgb));   // Simple glass is the lighter grey
});

test("simple mode: grey only, faint, no colour", () => {
  assert.ok(C.simple.stops.every((s) => s.c === "k" && s.a <= 0.06) && C.simple.stops[0].pos === 0 && C.simple.stops[C.simple.stops.length - 1].pos === 100);
  assert.ok(!simpleStripeCss().includes("255,255,255"));
  assert.match(simpleBackgroundCss(), /^linear-gradient\(180deg, #ffffff 0%, #[0-9a-f]{6} 100%\)$/);
  for (const h of [C.simple.bgTop, C.simple.bgBottom]) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); assert.ok(r === g && g === b && r >= 0xe0); }
  assert.ok(C.simple.shadow.offsetPx > 0 && C.simple.shadow.blurPx > 0 && C.simple.shadow.alpha > 0 && C.simple.shadow.alpha < 0.4);
  assert.ok(C.simple.imprint.scale > 1 && C.simple.imprint.scale < 1.4 && C.simple.imprint.alpha > 0 && C.simple.imprint.alpha <= 0.2);
  assert.equal(productShadowCss(), `drop-shadow(0 ${C.simple.shadow.offsetPx}px ${C.simple.shadow.blurPx}px rgba(0,0,0,${C.simple.shadow.alpha}))`);
  assert.ok(productImprintCss().startsWith("radial-gradient") && !productImprintCss().includes("blur"));
});

test("bottom curve: tilt grows to maxDeg, slices tile the zone, drift keeps stripes continuous", () => {
  const sl = curveSlices();
  assert.equal(sl.length, C.curve.slices);
  assert.ok(Math.abs(sl[sl.length - 1].deg - C.curve.maxDeg) < 1e-9 && sl.every((s, i) => i === 0 || s.deg > sl[i - 1].deg));
  assert.ok(Math.abs(sl.reduce((t, s) => t + s.heightPx, 0) - C.curve.zonePx) < 1e-9);
  assert.equal(sl[0].shiftPx, 0);
  assert.ok(sl.every((s, i) => i === 0 || (s.shiftPx < sl[i - 1].shiftPx && Math.abs(s.topPx - (sl[i - 1].topPx + sl[i - 1].heightPx)) < 1e-9)));
});
