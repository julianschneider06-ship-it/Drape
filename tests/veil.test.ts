import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_VEIL_MODE, DYN_DARK_BELOW, DYN_LIGHT_ABOVE, DYN_MAX_STRENGTH, DYN_MIN_STRENGTH, VEIL, VEIL_STRENGTH } from "../src/config/background-images";
import { LAYER_Z } from "../src/config/season-decor";
import { luminance } from "../src/lib/pixel-figure";
import { classifyPart, dynamicVeil, outfitPartColors, parseVeilDebug, partLuminance, resolveVeil, veilControlEnabled } from "../src/lib/veil";
import { cleanPrefs, DEFAULT_PREFS, migrateVeil, parseVeilLink } from "../src/lib/shop-pref";

const near = (a: number, b: number, e = 1e-3) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("luminance: known colours", () => {
  near(luminance("#000000"), 0); near(luminance("#ffffff"), 1); near(luminance("#808080"), 0.2159, 2e-3); near(luminance("#ff0000"), 0.2126);
  near(partLuminance("black")!, luminance("#1a1a1a")); assert.equal(partLuminance("multicolor"), null); assert.equal(partLuminance(undefined), null);
});
test("classification: dark / light / mid / unknown", () => {
  assert.equal(DYN_DARK_BELOW, 0.25); assert.equal(DYN_LIGHT_ABOVE, 0.6);
  assert.equal(classifyPart(partLuminance("black")), "dark"); assert.equal(classifyPart(partLuminance("navy")), "dark");
  assert.equal(classifyPart(partLuminance("white")), "light"); assert.equal(classifyPart(partLuminance("cream")), "light");
  assert.equal(classifyPart(partLuminance("grey")), "mid"); assert.equal(classifyPart(null), "mid");
  assert.equal(classifyPart(0.25), "mid"); assert.equal(classifyPart(0.6), "mid");
});
test("dynamic rule: d>l white, l>d black, tie none, all mid none, unknown = mid, empty none", () => {
  const dk = dynamicVeil(["black", "navy", "white"]); assert.equal(dk.color, "white"); assert.deepEqual(dk.counts, { dark: 2, light: 1, mid: 0 });
  const lt = dynamicVeil(["white", "cream", "black"]); assert.equal(lt.color, "black");
  assert.equal(dynamicVeil(["black", "white"]).opacity, 0);
  assert.equal(dynamicVeil(["grey", "grey"]).opacity, 0);
  const un = dynamicVeil([undefined, "multicolor", null]); assert.equal(un.opacity, 0); assert.equal(un.counts.mid, 3);
  assert.equal(dynamicVeil([]).opacity, 0);
  const one = dynamicVeil(["black", undefined, undefined]); assert.equal(one.color, "white"); near(one.opacity, DYN_MIN_STRENGTH + (DYN_MAX_STRENGTH - DYN_MIN_STRENGTH) / 3);
});
test("strength: all one side = MAX, never below MIN or above MAX when not tied", () => {
  near(dynamicVeil(["black", "black", "navy"]).opacity, DYN_MAX_STRENGTH);
  for (let d = 0; d <= 6; d++) for (let l = 0; l <= 6; l++) for (let m = 0; m <= 6; m++) {
    if (d + l + m === 0 || d === l) continue;
    const r = dynamicVeil([...Array(d).fill("black"), ...Array(l).fill("white"), ...Array(m).fill("grey")]);
    assert.ok(r.opacity >= DYN_MIN_STRENGTH - 1e-9 && r.opacity <= DYN_MAX_STRENGTH + 1e-9, `${d}/${l}/${m}`);
  }
});
test("Light / Dark / Off fixed, only with a picture; Dynamic follows the parts", () => {
  const n = ["black"], dbg = { opacity: null, color: null };
  assert.deepEqual([resolveVeil({ mode: "light", names: n, pictureOn: true, debug: dbg }).color, resolveVeil({ mode: "light", names: n, pictureOn: true, debug: dbg }).opacity], ["white", VEIL_STRENGTH]);
  assert.deepEqual([resolveVeil({ mode: "dark", names: n, pictureOn: true, debug: dbg }).color, resolveVeil({ mode: "dark", names: n, pictureOn: true, debug: dbg }).opacity], ["black", VEIL_STRENGTH]);
  assert.equal(resolveVeil({ mode: "off", names: n, pictureOn: true, debug: dbg }).opacity, 0);
  const d = resolveVeil({ mode: "dynamic", names: n, pictureOn: true, debug: dbg }); assert.equal(d.color, "white"); assert.equal(d.opacity, DYN_MAX_STRENGTH);
  for (const m of ["light", "dark", "dynamic"] as const) assert.equal(resolveVeil({ mode: m, names: n, pictureOn: false, debug: dbg }).opacity, 0);   // no picture (Sprites / Off / Stripe) = no veil
});
test("debug override wins over the setting and Dynamic, and is reported", () => {
  const r = resolveVeil({ mode: "dynamic", names: ["black"], pictureOn: true, debug: parseVeilDebug("?bgveil=0.5&bgveilcolor=black") });
  assert.deepEqual([r.color, r.opacity, r.override], ["black", 0.5, true]);
  assert.equal(resolveVeil({ mode: "light", names: [], pictureOn: true, debug: parseVeilDebug("?bgveil=0.9") }).opacity, 0.8);
  assert.equal(resolveVeil({ mode: "dynamic", names: [], pictureOn: true, debug: parseVeilDebug("?bgveil=0") }).opacity, 0);
  assert.equal(resolveVeil({ mode: "dark", names: [], pictureOn: true, debug: parseVeilDebug("?bgveil=x") }).override, false);
  assert.equal(VEIL.opacity, 0);
});
test("setting: default Dynamic, migration, ?veil link", () => {
  assert.equal(DEFAULT_VEIL_MODE, "dynamic"); assert.equal(DEFAULT_PREFS.veil, "dynamic");
  assert.equal(cleanPrefs({ v: 1, season: "pictures" }).veil, "dynamic");   // old save without the field
  assert.equal(cleanPrefs({ v: 1, veil: "dark" }).veil, "dark"); assert.equal(cleanPrefs({ v: 1, veil: "zzz" }).veil, "dynamic");
  assert.equal(migrateVeil(undefined), "dynamic"); assert.equal(migrateVeil("off"), "off");
  assert.equal(parseVeilLink("light"), "light"); assert.equal(parseVeilLink("x"), null); assert.equal(parseVeilLink(null), null);
});
test("Profile control: greyed without Pictures, caption, placed under Seasonal decoration", () => {
  assert.equal(veilControlEnabled("pictures", false), true); assert.equal(veilControlEnabled("sprites", false), false);
  assert.equal(veilControlEnabled("off", false), false); assert.equal(veilControlEnabled("pictures", true), false);
  const pv = readFileSync("src/components/ProfileView.tsx", "utf8");
  assert.match(pv, /id="veil-mode"/); assert.ok(pv.indexOf('id="season-mode"') < pv.indexOf('id="veil-mode"') && pv.indexOf('id="veil-mode"') < pv.indexOf('id="stripe-mode"'));
  assert.match(readFileSync("src/config/profile.ts", "utf8"), /Needs Pictures/);
});
test("shown parts: first colour per card, missing cards skipped, unknown counted", () => {
  const c = (id: number, col?: string) => ({ id, mq: col ? { col } : undefined }) as never;
  const o = { top: c(1, "black"), bottom: c(2), shoes: null, accessories: [{ card: c(3, "white") }] } as never;
  assert.deepEqual(outfitPartColors(o), ["black", undefined, "white"]); assert.deepEqual(outfitPartColors(null), []);
});
test("layer order: stripe < picture < veil < decor/figure < products < header/tab bar; veil layer uses LAYER_Z.veil", () => {
  assert.ok(LAYER_Z.stripe < LAYER_Z.image && LAYER_Z.image < LAYER_Z.veil && LAYER_Z.veil < LAYER_Z.decor && LAYER_Z.decor < LAYER_Z.figure && LAYER_Z.figure < LAYER_Z.products && LAYER_Z.products < LAYER_Z.chrome);
  assert.match(readFileSync("src/components/BackgroundPicture.tsx", "utf8"), /zIndex: LAYER_Z\.veil/);
});
