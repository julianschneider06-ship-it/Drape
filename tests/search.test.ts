import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILY_KEYS, STYLE_FAMILIES } from "../src/config/style-families";
import { EXTRAS, FAMILY_INFO, ITEMS, SEARCH_MAX_RESULTS, SEARCH_MIN_EXACT } from "../src/config/search";
import { buildFacets, facetCount, hasItem, isSearchedSlot, parseExtra, parseFamily, parseItem, searchRank, type SearchRow } from "../src/lib/search";
import { STYLE_KEYS } from "../src/classify/styles";

const row = (id: number, o: Partial<SearchRow> = {}): SearchRow => ({ id, fam: "smart", se: "autumn", sf: 0.8, ex: [], str: 0.5, sc: 1, acc: true, full: false, ...o });
const many = (n: number, o: Partial<SearchRow> = {}, from = 1) => Array.from({ length: n }, (_, i) => row(from + i, { str: 0.9 - i * 0.001, ...o }));

test("only the five families can be chosen, never a single style", () => {
  for (const f of FAMILY_KEYS) assert.equal(parseFamily(f), f);
  for (const style of STYLE_KEYS) assert.equal(parseFamily(style), null, style);   // every individual style is refused
  assert.equal(parseFamily("boho"), null); assert.equal(parseFamily("skater"), null); assert.equal(parseFamily(undefined), null);
  assert.equal(FAMILY_KEYS.length, 5);
  // no style name in the visible family / extra / item texts
  const texts = [...FAMILY_KEYS.flatMap((f) => [FAMILY_INFO[f].label, FAMILY_INFO[f].hint]), ...EXTRAS.flatMap((e) => [e.label, e.hint]), ...ITEMS.flatMap((i) => [i.label, i.hint])].join(" ").toLowerCase();
  for (const s of STYLE_KEYS) if (!["classic", "vintage", "resort"].includes(s)) assert.ok(!texts.includes(s.replace("_", " ")), s);
});

test("options: four items, extras are the icon attributes, parsers refuse the rest", () => {
  assert.deepEqual(ITEMS.map((i) => i.id), ["accessory", "shoes", "top", "bottom"]);
  assert.equal(parseItem("dress"), null); assert.equal(parseExtra("sale"), null); assert.equal(parseExtra("rain"), "rain");
});

test("filter by family: all styles of the family match, other families never", () => {
  const rows = [row(1), row(2, { fam: "street" }), row(3, { fam: "soft" })];
  assert.deepEqual(searchRank(rows, { family: "street", item: "shoes" }).ids, [2]);
  assert.equal(Object.values(STYLE_FAMILIES).flat().length, STYLE_KEYS.length);
});

test("item filter: one-piece outfits have no separate top or bottom; accessory needs an accessory", () => {
  const rows = [row(1), row(2, { full: true }), row(3, { acc: false })];
  assert.deepEqual(searchRank(rows, { family: "smart", item: "top" }).ids.sort(), [1, 3]);
  assert.deepEqual(searchRank(rows, { family: "smart", item: "shoes" }).ids.sort(), [1, 2, 3]);
  assert.deepEqual(searchRank(rows, { family: "smart", item: "accessory" }).ids.sort(), [1, 2]);
  assert.ok(hasItem(row(1), "bottom") && !hasItem(row(2, { full: true }), "bottom"));
});

test("exact matches are enough: no relaxation, capped at SEARCH_MAX_RESULTS", () => {
  const rows = [...many(60, { se: "winter", ex: ["rain"] }), ...many(20, { se: "summer" }, 100)];
  const r = searchRank(rows, { family: "smart", item: "shoes", season: "winter", extra: "rain" });
  assert.equal(r.relaxed, "none"); assert.equal(r.ids.length, SEARCH_MAX_RESULTS); assert.ok(r.ids.every((id) => id < 100));
});

test("thin supply relaxes the extra first, exact matches stay on top", () => {
  const rows = [...many(3, { se: "winter", ex: ["rain"] }), ...many(20, { se: "winter" }, 100), ...many(20, { se: "summer" }, 200)];
  const r = searchRank(rows, { family: "smart", item: "shoes", season: "winter", extra: "rain" });
  assert.equal(r.relaxed, "extra"); assert.deepEqual(r.ids.slice(0, 3), [1, 2, 3]); assert.ok(r.ids.every((id) => id < 200));
});

test("still thin: the season is relaxed second; family and item never", () => {
  const rows = [...many(2, { se: "winter", ex: ["rain"] }), ...many(2, { se: "winter" }, 100), ...many(30, { se: "summer" }, 200), ...many(30, { fam: "street" }, 400)];
  const r = searchRank(rows, { family: "smart", item: "shoes", season: "winter", extra: "rain" });
  assert.equal(r.relaxed, "season"); assert.deepEqual(r.ids.slice(0, 4), [1, 2, 100, 101]); assert.ok(r.ids.every((id) => id < 400));
  const s = searchRank(many(3, { se: "winter" }).concat(many(30, { se: "summer" }, 100)), { family: "smart", item: "shoes", season: "winter" });
  assert.equal(s.relaxed, "season");
});

test("zero results stay zero when even the family has none", () => {
  const r = searchRank([row(1, { fam: "soft" })], { family: "rugged", item: "shoes", season: "winter", extra: "rain" });
  assert.deepEqual(r.ids, []); assert.equal(r.relaxed, "none");
  assert.ok(SEARCH_MIN_EXACT > 1);
});

test("option counts only offer combinations that have results", () => {
  const f = buildFacets([row(1, { ex: ["rain"] }), row(2, { fam: "street", se: "summer", acc: false })]);
  assert.equal(facetCount(f, {}), 2);
  assert.equal(facetCount(f, { family: "smart", extra: "rain", item: "shoes" }), 1);
  assert.equal(facetCount(f, { family: "street", item: "accessory" }), 0);
  assert.equal(facetCount(f, { family: "street", season: "winter" }), 0);
});

test("greying: only the searched item is normal, everything else is secondary", () => {
  const slots = ["top", "bottom", "shoes", "full", "acc1", "acc2", "acc3"];
  const normal = (item: Parameters<typeof isSearchedSlot>[1]) => slots.filter((s) => isSearchedSlot(s, item));
  assert.deepEqual(normal("top"), ["top"]); assert.deepEqual(normal("bottom"), ["bottom"]);
  assert.deepEqual(normal("shoes"), ["shoes"]); assert.deepEqual(normal("accessory"), ["acc1", "acc2", "acc3"]);
});
