import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILY_KEYS, familyOf, STYLE_FAMILIES } from "../src/config/style-families";
import { EXTRAS, FAMILY_INFO, ITEMS, SEARCH_MAX_RESULTS, SEARCH_MIN_EXACT } from "../src/config/search";
import { buildFacets, collect, facetCount, isSearchedSlot, parseExtra, parseFamily, parseItem, searchRank, sumFacets, type SearchRow } from "../src/lib/search";
import { extrasOfPiece, familyFacts, rowsOf } from "../src/lib/search-index";
import { STYLE_KEYS } from "../src/classify/styles";
import { buildCatalogue, type RawCatAcc, type RawCatPiece } from "../src/outfits/catalogue";
import { composeAround, newAround } from "../src/outfits/compose-around";

const row = (id: number, o: Partial<SearchRow> = {}): SearchRow => ({ id, g: "men", item: "shoes", fam: "smart", mask: 4, ex: [], q: 0.5, store: `s${id}`, ...o });
const many = (n: number, o: Partial<SearchRow> = {}, from = 1) => Array.from({ length: n }, (_, i) => row(from + i, { q: 0.9 - i * 0.001, ...o }));
const ids = (r: { cands: { id: number }[] }) => r.cands.map((c) => c.id);
const Q = { family: "smart", item: "shoes" } as const;

test("only the five families can be chosen, never a single style", () => {
  for (const f of FAMILY_KEYS) assert.equal(parseFamily(f), f);
  for (const style of STYLE_KEYS) assert.equal(parseFamily(style), null, style);
  assert.equal(parseFamily("boho"), null); assert.equal(parseFamily("skater"), null); assert.equal(parseFamily(undefined), null);
  assert.equal(FAMILY_KEYS.length, 5);
  const texts = [...FAMILY_KEYS.flatMap((f) => [FAMILY_INFO[f].label, FAMILY_INFO[f].hint]), ...EXTRAS.flatMap((e) => [e.label, e.hint]), ...ITEMS.flatMap((i) => [i.label, i.hint])].join(" ").toLowerCase();
  for (const s of STYLE_KEYS) if (!["classic", "vintage", "resort"].includes(s)) assert.ok(!texts.includes(s.replace("_", " ")), s);
});

test("options: four parts in this order, extras are piece-level, parsers refuse the rest", () => {
  assert.deepEqual(ITEMS.map((i) => i.id), ["accessory", "shoes", "top", "bottom"]);
  assert.equal(parseItem("dress"), null); assert.equal(parseExtra("sale"), null); assert.equal(parseExtra("rain"), "rain");
  assert.equal(parseExtra("tonal"), null); assert.equal(parseExtra("contrast"), null);   // outfit-only extras are not offered
});

test("filters apply to the searched piece: family and part", () => {
  const rows = [row(1), row(2, { fam: "street" }), row(3, { item: "top" }), row(4, { fam: "soft" })];
  assert.deepEqual(ids(searchRank(rows, { family: "street", item: "shoes" }, "men")), [2]);
  assert.deepEqual(ids(searchRank(rows, { family: "smart", item: "top" }, "men")), [3]);
  assert.equal(Object.values(STYLE_FAMILIES).flat().length, STYLE_KEYS.length);
});

test("season is matched on the piece's season mask (an all-season piece matches every season)", () => {
  const rows = [row(1, { mask: 8 }), row(2, { mask: 15 }), row(3, { mask: 2 })];
  assert.deepEqual(ids(searchRank(rows, { ...Q, season: "winter" }, "men", 30, 1)).sort(), [1, 2]);
  assert.deepEqual(ids(searchRank(rows, { ...Q, season: "summer" }, "men", 30, 1)).sort(), [2, 3]);
});

test("own gender first, then the other gender; a unisex piece appears once", () => {
  const rows = [...many(3, { g: "women" }, 100), ...many(3, { g: "men" }, 1), row(50, { g: "men" }), row(50, { g: "women" })];
  const men = searchRank(rows, Q, "men"), women = searchRank(rows, Q, "women");
  assert.deepEqual(men.cands.map((c) => c.g), ["men", "men", "men", "men", "women", "women", "women"]);
  assert.deepEqual(women.cands.slice(0, 4).map((c) => c.g), ["women", "women", "women", "women"]);
  assert.equal(men.cands.filter((c) => c.id === 50).length, 1); assert.equal(men.cands.find((c) => c.id === 50)!.g, "men");
});

test("total cap is 30 with the own gender first, one result per piece", () => {
  const rows = [...many(20, { g: "men" }, 1), ...many(40, { g: "women" }, 100)];
  const r = searchRank(rows, Q, "men");
  const out = collect(r.cands, (c) => c);
  assert.equal(out.length, SEARCH_MAX_RESULTS); assert.equal(SEARCH_MAX_RESULTS, 30);
  assert.ok(out.slice(0, 20).every((c) => c.g === "men") && out.slice(20).every((c) => c.g === "women"));
  assert.equal(new Set(out.map((c) => c.id)).size, 30);
  const own = collect(searchRank(many(60, { g: "men" }), Q, "men").cands, (c) => c);
  assert.equal(own.length, 30); assert.ok(own.every((c) => c.g === "men"));   // enough own results: the other gender does not appear
});

test("a piece that cannot be composed is skipped, the next one takes its place", () => {
  const r = searchRank(many(40), Q, "men");
  const out = collect(r.cands, (c) => (c.id % 2 ? null : c.id));
  assert.equal(out.length, 20); assert.ok(out.every((x) => x % 2 === 0));
});

test("exact matches are enough: no relaxation", () => {
  const rows = [...many(60, { mask: 8, ex: ["rain"] }), ...many(20, { mask: 2 }, 100)];
  const r = searchRank(rows, { ...Q, season: "winter", extra: "rain" }, "men");
  assert.equal(r.relaxed, "none"); assert.ok(ids(r).every((id) => id < 100));
});

test("thin supply relaxes the extra first, exact matches stay on top", () => {
  const rows = [...many(3, { mask: 8, ex: ["rain"] }), ...many(20, { mask: 8 }, 100), ...many(20, { mask: 2 }, 200)];
  const r = searchRank(rows, { ...Q, season: "winter", extra: "rain" }, "men");
  assert.equal(r.relaxed, "extra"); assert.deepEqual(ids(r).slice(0, 3), [1, 2, 3]); assert.ok(ids(r).every((id) => id < 200));
});

test("still thin: the season is relaxed second; family and part never", () => {
  const rows = [...many(2, { mask: 8, ex: ["rain"] }), ...many(2, { mask: 8 }, 100), ...many(30, { mask: 2 }, 200), ...many(30, { fam: "street" }, 400), ...many(30, { item: "top" }, 500)];
  const r = searchRank(rows, { ...Q, season: "winter", extra: "rain" }, "men");
  assert.equal(r.relaxed, "season"); assert.deepEqual(ids(r).slice(0, 4), [1, 2, 100, 101]); assert.ok(ids(r).every((id) => id < 400));
  assert.equal(searchRank(many(3, { mask: 8 }).concat(many(30, { mask: 2 }, 100)), { ...Q, season: "winter" }, "men").relaxed, "season");
});

test("relaxation counts both genders together", () => {
  const rows = [...many(2, { g: "men", mask: 8 }), ...many(10, { g: "women", mask: 8 }, 100), ...many(20, { g: "men", mask: 2 }, 200)];
  assert.equal(searchRank(rows, { ...Q, season: "winter" }, "men").relaxed, "none");   // 12 exact pieces over both genders
});

test("zero results stay zero when even the family has none", () => {
  const r = searchRank([row(1, { fam: "soft" })], { family: "rugged", item: "shoes", season: "winter", extra: "rain" }, "men");
  assert.deepEqual(r.cands, []); assert.equal(r.relaxed, "none"); assert.ok(SEARCH_MIN_EXACT > 1);
});

test("one shop cannot fill the page when others have matches", () => {
  const rows = [...many(20, { store: "a" }), ...many(10, { store: "b" }, 100), ...many(10, { store: "c" }, 200)];
  const top = ids(searchRank(rows, Q, "men")).slice(0, 15);
  assert.ok(top.filter((id) => id < 100).length <= 5 + 1, `shop a took ${top.filter((id) => id < 100).length}`);
});

test("option counts: part first, then family, season, extra; both genders; only options with results", () => {
  const rows = [row(1, { ex: ["rain"] }), row(2, { g: "women", fam: "street", mask: 2, item: "accessory" }), row(3, { item: "top", fam: "soft", mask: 15 })];
  const f = sumFacets(buildFacets(rows.filter((r) => r.g === "men")), buildFacets(rows.filter((r) => r.g === "women")));
  assert.equal(facetCount(f, {}), 3);
  assert.equal(facetCount(f, { item: "accessory" }), 1);                                   // women's accessory counts for a men's search
  assert.equal(facetCount(f, { item: "accessory", family: "street", season: "summer" }), 1);
  assert.equal(facetCount(f, { item: "accessory", family: "street", season: "winter" }), 0);
  assert.equal(facetCount(f, { item: "shoes", family: "smart", extra: "rain" }), 1);
  assert.equal(facetCount(f, { item: "top", family: "soft", season: "winter" }), 1);        // an all-season piece counts for every season
  assert.equal(facetCount(f, { item: "top", family: "smart" }), 0);
});

test("greying: only the searched part is normal (the searched accessory is the first one)", () => {
  const slots = ["top", "bottom", "shoes", "full", "acc1", "acc2", "acc3"];
  const normal = (item: Parameters<typeof isSearchedSlot>[1]) => slots.filter((s) => isSearchedSlot(s, item));
  assert.deepEqual(normal("top"), ["top"]); assert.deepEqual(normal("bottom"), ["bottom"]);
  assert.deepEqual(normal("shoes"), ["shoes"]); assert.deepEqual(normal("accessory"), ["acc1"]);
});

// ---- piece facts ----
const vecOf = (k: string, w = 1) => { const v = new Float32Array(STYLE_KEYS.length); v[STYLE_KEYS.indexOf(k as never)] = w; return v; };
test("family of a piece = family of its dominant style; extras use the outfit-tag thresholds on the piece", () => {
  assert.equal(familyFacts(vecOf("streetwear"))!.fam, "street"); assert.equal(familyFacts(vecOf("boho"))!.fam, "soft");
  const base = { vec: vecOf("classic"), formality: 0.3, bold: 0.2, statement: 0.2, main: "black", mask: 15, text: "plain tee", full: false, warm: false };
  assert.deepEqual(extrasOfPiece(base), []);
  assert.ok(extrasOfPiece({ ...base, text: "Waterproof anorak" }).includes("rain"));
  assert.ok(extrasOfPiece({ ...base, formality: 0.7 }).includes("formal") && extrasOfPiece({ ...base, formality: 0.7 }).includes("evening"));
  assert.ok(extrasOfPiece({ ...base, formality: 0.6 }).includes("office"));
  assert.ok(extrasOfPiece({ ...base, main: "red", bold: 0.6 }).includes("bold") && extrasOfPiece({ ...base, main: "red" }).includes("colourful"));
  assert.ok(extrasOfPiece({ ...base, vec: vecOf("resort"), mask: 2 }).includes("resort"));
});

// ---- composing around the searched piece (synthetic catalogue, no database) ----
let pid = 0;
const piece = (slot: string, style: string, o: Partial<RawCatPiece> = {}): RawCatPiece => ({
  id: ++pid, name: `${style} ${slot} ${pid}`, store: `shop${pid % 5}`, slot: slot as RawCatPiece["slot"], gender: "men", sub: slot === "top" ? "tee" : slot === "bottom" ? "trousers" : slot === "shoes" ? "sneaker" : "dress",
  styles: { [style]: 1 }, colors: ["black"], pattern: "solid", silhouette: "regular", fit: "regular", formality: 0.4, boldness: 0.2, statement: 0.2, outer: false, season: ["spring", "summer", "autumn", "winter"],
  brand: "b", aspect: slot === "shoes" ? 1.6 : 0.85, hem: null, waist: null, collar: null, hood: null, fill: 0.8, presentation: null, cutout: `c${pid}.png`, image: `i${pid}.jpg`, url: "u", price_cents: 1000, compare_at_cents: null, currency: "USD", ...o });
const accOf = (type: string, style: string, o: Partial<RawCatAcc> = {}): RawCatAcc => ({
  id: ++pid, name: `${type} ${pid}`, store: `shop${pid % 5}`, type, size: "m", front_flat: false, belt_shape: null, gender: "men", styles: { [style]: 1 }, colors: ["black"], pattern: "solid", material: null,
  formality: 0.4, boldness: 0.2, statement: 0.2, season: ["spring", "summer", "autumn", "winter"], brand: "b", aspect: 1, cutout: `c${pid}.png`, image: `i${pid}.jpg`, url: "u", price_cents: 500, compare_at_cents: null, currency: "USD", ...o });
const synth = () => {
  pid = 0;
  const pieces: RawCatPiece[] = [];
  for (let i = 0; i < 30; i++) pieces.push(piece("top", "streetwear"), piece("bottom", "streetwear"), piece("shoes", "streetwear"), piece("top", "classic"), piece("bottom", "classic"), piece("shoes", "classic"));
  pieces.push(piece("full_body", "classic", { gender: "women" }), piece("full_body", "classic", { gender: "women" }), piece("shoes", "classic", { gender: "women" }));
  const accs = ["cap", "bag", "watch", "belt", "sunglasses"].flatMap((t) => Array.from({ length: 6 }, () => accOf(t, "streetwear")));
  return buildCatalogue({ version: "t", pieces, accs });
};

test("rows: only tops, bottoms, shoes and accessories with a card; one-piece garments are never a top or bottom", () => {
  const cat = synth(), men = rowsOf(cat, "men"), women = rowsOf(cat, "women");
  assert.ok(men.length > 0 && women.length > 0);
  assert.ok([...men, ...women].every((r) => ["accessory", "shoes", "top", "bottom"].includes(r.item)));
  const full = new Set(cat.pieces.filter((p) => p.slot === "full_body").map((p) => p.id));
  assert.ok([...men, ...women].every((r) => !full.has(r.id)));
  assert.ok(men.every((r) => r.g === "men") && women.every((r) => r.g === "women"));
});

test("compose around: the searched piece is in the outfit, the rest is free (any style family), same result twice", () => {
  pid = 0;   // searched shoes are smart (classic); every top and bottom is rugged (workwear-led) with a similar style vector, so the rest of the outfit is in ANOTHER family
  const pieces: RawCatPiece[] = [];
  for (let i = 0; i < 25; i++) pieces.push(piece("shoes", "classic", { styles: { classic: 0.8, workwear: 0.6 } }), piece("top", "workwear", { styles: { workwear: 0.8, classic: 0.6 } }), piece("bottom", "workwear", { styles: { workwear: 0.8, classic: 0.6 } }));
  const cat = buildCatalogue({ version: "t", pieces, accs: [] });
  const shoes = cat.pieces.filter((p) => p.slot === "shoes");
  assert.ok(shoes.every((p) => familyOf(p.dom) === "smart"));
  let built = 0, rest = 0;
  for (const s of shoes.slice(0, 12)) {
    const a = composeAround(cat, "men", s.id, false, newAround()), b = composeAround(cat, "men", s.id, false, newAround());
    assert.deepEqual(a && a.hash, b && b.hash);   // deterministic
    if (!a) continue;
    built++; assert.ok(a.ids.includes(s.id)); assert.equal(a.kind, "three");
    for (const id of a.ids) if (id !== s.id) { rest++; assert.equal(familyOf(cat.byId.get(id)!.dom), "rugged"); }
  }
  assert.ok(built >= 8 && rest >= 16, `built ${built}`);   // the rest of the outfit is NOT required to be in the searched family
});

test("compose around: top / bottom outfits stay three-piece (dress rule), shoes may also get a one-piece garment for women", () => {
  const cat = synth();
  for (const slot of ["top", "bottom"]) {
    const p = cat.pieces.find((x) => x.slot === slot && x.genders.includes("men"))!;
    const o = composeAround(cat, "men", p.id, false, newAround()); assert.ok(o); assert.equal(o!.kind, "three"); assert.ok(o!.ids.includes(p.id));
  }
  const ws = cat.pieces.find((x) => x.slot === "shoes" && x.genders.includes("women"))!;
  const o = composeAround(cat, "women", ws.id, false, newAround()); assert.ok(o); assert.equal(o!.kind, "full"); assert.ok(o!.ids.includes(ws.id));
});

test("compose around an accessory: it comes first, slot limits hold, other accessories are different types", () => {
  const cat = synth(), st = newAround();
  const bags = cat.accs.filter((a) => a.type === "bag").slice(0, 6); let built = 0;
  for (const a of bags) {
    const o = composeAround(cat, "men", a.id, true, st); if (!o) continue;
    built++;
    assert.equal(o.acc[0].id, a.id); assert.ok(o.acc.length <= 3);
    const types = o.acc.map((x) => x.type); assert.equal(new Set(types).size, types.length);
    assert.equal(types.filter((t) => t === "bag" || t === "backpack").length, 1);
  }
  assert.ok(built >= 4, `built ${built}`);
});
