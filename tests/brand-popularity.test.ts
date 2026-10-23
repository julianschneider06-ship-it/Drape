import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { COMBINED_MULT, POPULARITY, POPULARITY_WEIGHTS } from "../src/config/popularity";
import { SHOP_PREF } from "../src/config/shop-pref";
import { aggregate, attributeClick, attributeEvent, averageRate, brandBoostOn, brandFactor, brandKey, combinedMult, factorMap, weightedSignal, type PopRow } from "../src/lib/popularity";
import { debugOn } from "../src/lib/debug-link";
import { DeviceDebugLine } from "../src/components/DeviceDebug";
import ProfileView from "../src/components/ProfileView";
import MotionRoot from "../src/components/MotionRoot";

const prods: Record<number, { gender: string | null; brand_norm: string }> = {
  1: { gender: "men", brand_norm: "a" }, 2: { gender: "women", brand_norm: "b" }, 3: { gender: "unisex", brand_norm: "c" }, 4: { gender: null, brand_norm: "d" },
};
const prod = (id: number) => prods[id];
const sum = (e: Parameters<typeof attributeEvent>[0]) => attributeEvent(e, prod).map((a) => `${a.gender}:${a.brand}:${a.field}:${a.delta}`);

test("attribution: impressions and scroll-pasts count every piece of the outfit, in the feed's gender", () => {
  assert.deepEqual(sum({ event_type: "impression", gender: "women", product_ids: [3, 2] }), ["women:c:impressions:1", "women:b:impressions:1"]);
  assert.deepEqual(sum({ event_type: "scroll_past", gender: "men", product_ids: [3, 1] }), ["men:c:scroll_pasts:1", "men:a:scroll_pasts:1"]);
});
test("attribution: unisex counts for the feed it was shown in; missing gender falls back to the product, else skipped", () => {
  assert.deepEqual(sum({ event_type: "tap_product", gender: "men", product_id: 3 }), ["men:c:taps:1"]);
  assert.deepEqual(sum({ event_type: "tap_product", gender: null, product_id: 2 }), ["women:b:taps:1"]);
  assert.deepEqual(sum({ event_type: "tap_product", gender: null, product_id: 3 }), []);
  assert.deepEqual(sum({ event_type: "tap_product", gender: null, product_id: 4 }), []);
});
test("attribution: like adds, unlike subtracts, other event types are ignored, unknown products are skipped", () => {
  assert.deepEqual(sum({ event_type: "like", gender: "men", product_id: 1, product_ids: [1, 3] }), ["men:a:likes:1"]);   // the outfit context in product_ids is not counted for a like
  assert.deepEqual(sum({ event_type: "unlike", gender: "men", product_id: 1 }), ["men:a:likes:-1"]);
  for (const t of ["dwell_ms", "swap", "outfit_up", "outfit_down", "outfit_clear", "view_product_click", "search_started", "search_submitted"]) assert.deepEqual(sum({ event_type: t, gender: "men", product_id: 1, product_ids: [1] }), [], t);
  assert.deepEqual(sum({ event_type: "like", gender: "men", product_id: 999 }), []);
});
test("attribution: outbound click counts for the product's gender, a unisex product for both", () => {
  assert.deepEqual(attributeClick(prods[1]).map((a) => a.gender), ["men"]);
  assert.deepEqual(attributeClick(prods[3]).map((a) => a.gender), ["men", "women"]);
});
test("aggregate: unlike subtracts the like (floored at 0) and the exclusion list is applied before counting", () => {
  const ev = [
    { device_id: "d1", event_type: "like", gender: "men", product_id: 1 }, { device_id: "d1", event_type: "unlike", gender: "men", product_id: 1 },
    { device_id: "d2", event_type: "like", gender: "men", product_id: 1 }, { device_id: "d3", event_type: "unlike", gender: "women", product_id: 2 },
    { device_id: "test", event_type: "impression", gender: "men", product_ids: [1, 1, 1] },
    { device_id: "d2", event_type: "impression", gender: "men", product_ids: [1] },
  ];
  const all = aggregate(ev, [], prod);
  assert.equal(all.get("men|a")!.likes, 1); assert.equal(all.get("women|b")!.likes, 0); assert.equal(all.get("men|a")!.impressions, 4);
  const ex = aggregate(ev, [], prod, new Set(["test", "d2"]));
  assert.equal(ex.get("men|a")!.likes, 0); assert.equal(ex.get("men|a")!.impressions, 0);
});

const row = (brand: string, impressions: number, likes: number, extra: Partial<PopRow> = {}): PopRow => ({ gender: "men", brand_norm: brand, impressions, likes, taps: 0, outbound_clicks: 0, scroll_pasts: 0, ...extra });
test("signal: weights as documented", () => {
  assert.equal(weightedSignal({ impressions: 0, likes: 2, taps: 10, outbound_clicks: 1, scroll_pasts: 200 }), 2 + 3 + 2 - 200 * POPULARITY_WEIGHTS.scrollPast);
});
test("factor: neutral below MIN_IMPRESSIONS whatever the signal, neutral when the average is not positive", () => {
  assert.equal(brandFactor(row("x", POPULARITY.minImpressions - 1, 50), 0.01), 1);
  assert.notEqual(brandFactor(row("x", POPULARITY.minImpressions, 50), 0.01), 1);
  assert.equal(brandFactor(row("x", 1000, 50), 0), 1); assert.equal(brandFactor(row("x", 1000, 50), -0.01), 1);
});
test("factor: smoothing shrinks toward the average, clamp holds both ends, average brand stays near 1", () => {
  const avg = 0.01;
  const f = brandFactor(row("x", 400, 4), avg);   // rate 0.01 = average -> 1
  assert.ok(Math.abs(f - 1) < 1e-9);
  assert.equal(brandFactor(row("x", 400, 400), avg), POPULARITY.factorMax);
  assert.equal(brandFactor(row("x", 400, 0, { scroll_pasts: 400 }), avg), POPULARITY.factorMin);
  // shrinkage: the same raw rate with fewer impressions moves less than with many
  const small = brandFactor(row("x", 300, 4), avg), big = brandFactor(row("x", 3000, 40), avg);   // both raw rate 0.0133
  assert.ok(small > 1 && big > small && big <= POPULARITY.factorMax);
  const expected = 1 + POPULARITY.gain * (((4 + POPULARITY.smoothingK * avg) / (300 + POPULARITY.smoothingK)) / avg - 1);
  assert.ok(Math.abs(small - expected) < 1e-9);
});
test("factorMap: empty table and stale data give neutral factors; fresh data lists only brands that differ from 1", () => {
  const rows = [row("hot", 1000, 40), row("cold", 1000, 0), row("mid", 1000, 10), row("tiny", 10, 5), row("w", 1000, 99, { gender: "women" })];
  const now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(factorMap([], "men", "2026-10-23T01:45:00Z", now).size, 0);
  assert.equal(factorMap(rows, "men", null, now).size, 0);
  assert.equal(factorMap(rows, "men", "2026-10-19T01:45:00Z", now).size, 0);   // older than staleHours
  const m = factorMap(rows, "men", "2026-10-23T01:45:00Z", now);
  assert.ok(m.get("hot")! > 1 && m.get("cold")! < 1); assert.ok(!m.has("tiny")); assert.ok(!m.has("w"));   // other gender's rows never leak in
  for (const v of m.values()) assert.ok(v >= POPULARITY.factorMin && v <= POPULARITY.factorMax);
  assert.ok(averageRate(rows.filter((r) => r.gender === "men")) > 0);
});
test("combined multiplier: stays inside the range, shop level alone is untouched, neither side can vanish or dominate", () => {
  for (const s of [SHOP_PREF.less, 1, SHOP_PREF.more]) {
    assert.equal(combinedMult(s, 1), s);
    for (const b of [POPULARITY.factorMin, 1.1, POPULARITY.factorMax]) { const c = combinedMult(s, b); assert.ok(c >= COMBINED_MULT.min && c <= COMBINED_MULT.max, `${s} x ${b} = ${c}`); }
  }
  assert.equal(combinedMult(SHOP_PREF.more, POPULARITY.factorMax), COMBINED_MULT.max);
  assert.equal(combinedMult(SHOP_PREF.less, POPULARITY.factorMin), COMBINED_MULT.min);
  assert.ok(combinedMult(1, POPULARITY.factorMax) === POPULARITY.factorMax);
});
test("switches: ?brand=0 and brand_boost_enabled=false both turn the boost off", () => {
  assert.equal(brandBoostOn(true, false), true); assert.equal(brandBoostOn(true, true), false); assert.equal(brandBoostOn(false, false), false);
  const st = readFileSync("src/lib/settings.ts", "utf8");   // settings.ts is server-only (cannot be imported in a test): check the default and the validation by text
  assert.match(st, /brand_boost_enabled: true \}/); assert.match(st, /typeof r\.brand_boost_enabled === "boolean" \? r\.brand_boost_enabled : CODE_DEFAULTS\.brand_boost_enabled/);
  assert.match(readFileSync("src/lib/dynamic.ts", "utf8"), /brandBoostOn\(\(await getSettings\(\)\)\.brand_boost_enabled, inp\.brand === false\)/);
  assert.match(readFileSync("src/components/Feed.tsx", "utf8"), /get\("brand"\) === "0" \? 0/);   // the link parameter reaches the request
  assert.match(readFileSync("src/app/api/dynamic/route.ts", "utf8"), /brand: b\.brand === 0 \? false/);
});
test("brandKey matches products.brand_norm (lower-case, trimmed)", () => { assert.equal(brandKey("  Taylor Stitch "), "taylor stitch"); });
test("SQL view constants match src/config/popularity.ts", () => {
  const sql = readFileSync("supabase/migrations/20261023160000_brand_popularity.sql", "utf8");
  const w = POPULARITY_WEIGHTS;
  assert.ok(sql.includes(`likes * ${w.like.toFixed(1)} + taps * ${w.tap} + outbound_clicks * ${w.click.toFixed(1)} - scroll_pasts * ${w.scrollPast}`));
  assert.ok(sql.includes(`impressions < ${POPULARITY.minImpressions}`) && sql.includes(`least(${POPULARITY.factorMax.toFixed(2)}, greatest(${POPULARITY.factorMin}, 1 + ${POPULARITY.gain} *`) && sql.includes(`${POPULARITY.smoothingK} * avg_rate`) && sql.includes(`(impressions + ${POPULARITY.smoothingK})`));
  assert.ok(sql.includes("'45 1 * * *'"));
  assert.doesNotMatch(sql.slice(sql.indexOf("create table"), sql.indexOf("alter table")), /device/);   // no device ids in the new table
  assert.doesNotMatch(sql.slice(sql.indexOf("create or replace view")), /device/);   // nor in the dashboard view
});
test("Profile: the device id shows only with ?debug=1", () => {
  assert.equal(debugOn("?debug=1"), true); assert.equal(debugOn("?x=1&debug=1"), true);
  assert.equal(debugOn(""), false); assert.equal(debugOn("?debug=0"), false); assert.equal(debugOn(null), false);
  const id = "11111111-2222-4333-8444-555555555555";
  assert.match(renderToString(createElement(DeviceDebugLine, { id })), new RegExp(id));
  const html = renderToString(createElement(MotionRoot, null, createElement(ProfileView)));   // server render: no window, so no id and no debug element
  assert.doesNotMatch(html, /device-debug/); assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
});
