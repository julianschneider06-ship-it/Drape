import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPrefs, DEFAULT_PREFS, effectiveBg, effectiveSale, encodeShopPrefs, levelWeight, parseShopPrefs, readPrefs, shopWeights, writePrefs } from "../src/lib/shop-pref";
import { filterShops, yourShops } from "../src/lib/profile-shops";
import { SHOP_PREF, SHOP_PREF_LIMITS } from "../src/config/shop-pref";
import { shopList } from "../src/lib/shops-server";
import type { Catalogue } from "../src/outfits/catalogue";

test("parse: valid entries", () => {
  const m = parseShopPrefs("kith:M,rains:L");
  assert.equal(m.get("kith"), "more"); assert.equal(m.get("rains"), "less"); assert.equal(m.size, 2);
});
test("parse: unknown shops are ignored when the known set is given", () => {
  const m = parseShopPrefs("kith:M,ghost:L", new Set(["kith"]));
  assert.deepEqual([...m.keys()], ["kith"]);
});
test("parse: garbage gives an empty result, never throws", () => {
  for (const g of [undefined, null, 5, {}, [], "", ":", "::", "kith", "kith:", ":M", "kith:X", "KITH:M", "ki th:M", "kith:M:L", "a".repeat(80) + ":M", "../etc:M", "<script>:M"]) {
    assert.equal(parseShopPrefs(g).size, 0, String(g));
  }
});
test("parse: bad entries are skipped, good ones in the same string stay", () => {
  assert.deepEqual([...parseShopPrefs("bad!:M,kith:M,,x:Q").keys()], ["kith"]);
});
test("parse: oversize string is ignored as a whole", () => {
  const big = Array.from({ length: 400 }, (_, i) => `shop${i}:M`).join(",");
  assert.ok(big.length > SHOP_PREF_LIMITS.maxChars);
  assert.equal(parseShopPrefs(big).size, 0);
});
test("parse: entry count is capped", () => {
  const many = Array.from({ length: SHOP_PREF_LIMITS.maxEntries + 50 }, (_, i) => `s${i}:M`).join(",").slice(0, SHOP_PREF_LIMITS.maxChars);
  assert.ok(parseShopPrefs(many).size <= SHOP_PREF_LIMITS.maxEntries);
});
test("encode / parse round trip, normal is never sent", () => {
  const s = encodeShopPrefs({ kith: "more", rains: "less" });
  assert.equal(s, "kith:M,rains:L");
  assert.deepEqual([...parseShopPrefs(s)], [["kith", "more"], ["rains", "less"]]);
  assert.equal(encodeShopPrefs({}), "");
  assert.equal(encodeShopPrefs({ "bad id": "more" }), "");
});

test("default is Normal: weight 1 and no stored shops", () => {
  assert.equal(levelWeight(undefined), 1); assert.equal(levelWeight("normal"), 1);
  assert.deepEqual(DEFAULT_PREFS.shops, {}); assert.equal(DEFAULT_PREFS.sale, true);
});
test("weights: more raises, less lowers, never zero or negative", () => {
  assert.equal(levelWeight("more"), SHOP_PREF.more); assert.equal(levelWeight("less"), SHOP_PREF.less);
  assert.ok(SHOP_PREF.less > 0 && SHOP_PREF.less < 1 && SHOP_PREF.more > 1);
  const w = shopWeights(new Map([["a", "more" as const], ["b", "less" as const]]));
  assert.equal(w.get("a"), SHOP_PREF.more); assert.equal(w.get("b"), SHOP_PREF.less); assert.equal(w.get("c"), undefined);
});

test("effective sale marker: global off beats local on", () => {
  assert.equal(effectiveSale(null, false, true), false);
  assert.equal(effectiveSale(null, true, false), false);
  assert.equal(effectiveSale(null, true, true), true);
  assert.equal(effectiveSale(null, false, false), false);
});
test("effective sale marker: link parameters keep working", () => {
  assert.equal(effectiveSale("on", false, false), true);
  assert.equal(effectiveSale("off", true, true), false);
  assert.equal(effectiveSale("other", true, true), true);
});

test("storage: empty, garbage, wrong version and blocked storage give defaults", () => {
  assert.deepEqual(readPrefs(null, "k"), DEFAULT_PREFS);
  assert.deepEqual(readPrefs({ getItem: () => null }, "k"), DEFAULT_PREFS);
  assert.deepEqual(readPrefs({ getItem: () => "{not json" }, "k"), DEFAULT_PREFS);
  assert.deepEqual(readPrefs({ getItem: () => JSON.stringify({ v: 2, sale: false }) }, "k"), DEFAULT_PREFS);
  assert.deepEqual(readPrefs({ getItem: () => { throw new Error("blocked"); } }, "k"), DEFAULT_PREFS);
  assert.equal(writePrefs({ setItem: () => { throw new Error("blocked"); } }, "k", DEFAULT_PREFS), false);
  assert.equal(writePrefs(null, "k", DEFAULT_PREFS), false);
});
test("storage: round trip and cleaning of stored values", () => {
  let saved = "";
  assert.equal(writePrefs({ setItem: (_k, v) => { saved = v; } }, "k", { v: 1, sale: false, bg: true, season: true, mini: true, shops: { kith: "more" } }), true);
  assert.deepEqual(readPrefs({ getItem: () => saved }, "k"), { v: 1, sale: false, bg: true, season: true, mini: true, shops: { kith: "more" } });
  assert.deepEqual(cleanPrefs({ v: 1, sale: "yes", shops: { kith: "normal", ok: "less", "BAD ID": "more", x: 3 } }), { v: 1, sale: true, bg: true, season: true, mini: true, shops: { ok: "less" } });
});

test("shop filter: case-insensitive, instant, empty query matches nothing", () => {
  const shops = [{ id: "kith", name: "Kith" }, { id: "simonmiller", name: "Simon Miller" }, { id: "stinegoya", name: "Stine Goya" }];
  assert.deepEqual(filterShops(shops, "SI").map((s) => s.id), ["simonmiller"]);
  assert.deepEqual(filterShops(shops, "  st ").map((s) => s.id), ["stinegoya"]);
  assert.deepEqual(filterShops(shops, ""), []); assert.deepEqual(filterShops(shops, "zzz"), []);
  assert.equal(filterShops(shops, "i", 1).length, 1);
});
test("your shops: grouped More then Less, hides shops that are no longer live", () => {
  const live = [{ id: "kith", name: "Kith" }, { id: "rains", name: "Rains" }];
  const g = yourShops({ kith: "more", rains: "less", gone: "more" }, live);
  assert.deepEqual(g.more.map((s) => s.id), ["kith"]); assert.deepEqual(g.less.map((s) => s.id), ["rains"]);
  assert.deepEqual(yourShops({ some_shop: "less" }, null).less[0], { id: "some_shop", name: "Some Shop" });
  assert.deepEqual(yourShops({}, live), { more: [], less: [] });
});

const cat = (pieces: { id: number; store: string; genders?: string[] }[], accs: { id: number; store: string; genders?: string[] }[] = []) => ({ pieces, accs }) as unknown as Catalogue;
test("shop list: live shops only, unisex counted once, display names, sorted", () => {
  const src = new Map([["kith", { name: "Kith" }], ["old", { name: "Old Shop", active: false }], ["a", { name: "Alpha" }]]);
  const W = ["women"], M = ["men"], U = ["women", "men"];
  const list = shopList([cat([{ id: 1, store: "kith", genders: U }, { id: 2, store: "old", genders: W }, { id: 3, store: "a", genders: W }]), cat([{ id: 1, store: "kith", genders: U }], [{ id: 9, store: "kith", genders: M }, { id: 10, store: "brand-new", genders: M }])], src);
  assert.deepEqual(list, [{ id: "a", name: "Alpha", n: 1, g: { women: 1, men: 0 } }, { id: "brand-new", name: "Brand New", n: 1, g: { women: 0, men: 1 } }, { id: "kith", name: "Kith", n: 2, g: { women: 1, men: 2 } }]);
});

test("drape background: default on, stored choice, link wins", () => {
  assert.equal(DEFAULT_PREFS.bg, true);
  assert.equal(cleanPrefs({ v: 1, bg: false }).bg, false);
  assert.equal(cleanPrefs({ v: 1, bg: "no" }).bg, true);
  assert.equal(cleanPrefs({ v: 1, sale: false }).bg, true);   // old saves keep working
  assert.equal(effectiveBg(null, false), false);
  assert.equal(effectiveBg("1", false), true);
  assert.equal(effectiveBg("0", true), false);
  assert.equal(effectiveBg("x", true), true);
});
