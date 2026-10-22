import { test } from "node:test";
import assert from "node:assert/strict";
import { likeSignal } from "../src/lib/like-signal";
import { applySignals } from "../src/outfits/taste-codec";
import { newTaste, topStyles } from "../src/outfits/taste";
import { buildCatalogue, type RawCatPiece } from "../src/outfits/catalogue";
import { EMPTY_SEL, canClear, decodeState, encodeState, freshState, hasSel, tapAction } from "../src/lib/search-state";
import { shineVisible } from "../src/lib/shine";

let pid = 0;
const piece = (slot: string, style: string, o: Partial<RawCatPiece> = {}): RawCatPiece => ({
  id: ++pid, name: `${style} ${slot} ${pid}`, store: `shop${pid % 5}`, slot: slot as RawCatPiece["slot"], gender: "men", sub: slot === "top" ? "tee" : slot === "bottom" ? "trousers" : "sneaker",
  styles: { [style]: 1 }, colors: ["black"], pattern: "solid", silhouette: "regular", fit: "regular", formality: 0.4, boldness: 0.2, statement: 0.2, outer: false, season: ["spring", "summer", "autumn", "winter"],
  brand: "b", aspect: slot === "shoes" ? 1.6 : 0.85, hem: null, waist: null, collar: null, hood: null, fill: 0.8, presentation: null, cutout: `c${pid}.png`, image: `i${pid}.jpg`, url: "u", price_cents: 1000, compare_at_cents: null, currency: "USD", ...o });
const cat = () => { pid = 0; return buildCatalogue({ version: "t", pieces: [piece("top", "streetwear"), piece("bottom", "streetwear"), piece("shoes", "streetwear"), piece("top", "classic"), piece("bottom", "classic"), piece("shoes", "classic")], accs: [] }); };

test("like with outfit context: the signal carries the outfit and changes the taste", () => {
  const c = cat(), s = likeSignal(true, 1, { ids: [1, 2, 3], tg: { se: "summer" } });
  assert.equal(s.dir, null); assert.deepEqual(s.signal.o, [1, 2, 3]); assert.equal(s.signal.t, "like");
  const t = newTaste(), r = applySignals(c, t, [s.signal]);
  assert.equal(r.applied, 1); assert.equal(t.n, 1);
  assert.equal(topStyles(t, "top", 1)[0][0], "streetwear");   // the liked top's style leads in the taste
});

test("like without outfit context: the product alone still changes the taste", () => {
  const c = cat(), s = likeSignal(true, 4, null);
  assert.equal(s.dir, null); assert.equal(s.signal.o, undefined); assert.equal(s.signal.p, 4);
  const t = newTaste(), r = applySignals(c, t, [s.signal]);
  assert.equal(r.applied, 1); assert.equal(t.n, 1);
  assert.equal(topStyles(t, "top", 1)[0][0], "classic"); assert.ok(t.categories.tee > 0);   // style and category come from the product itself
});

test("like on an other-direction Search result: counts for THAT direction, from the product alone", () => {
  const c = cat(), s = likeSignal(true, 4, { ids: [4, 5, 6], tg: { se: "winter" }, og: "women" });
  assert.equal(s.dir, "women"); assert.equal(s.signal.o, undefined); assert.equal(s.signal.tg, undefined); assert.equal(s.signal.p, 4);
  const t = newTaste(); assert.equal(applySignals(c, t, [s.signal]).applied, 1); assert.equal(t.n, 1);
  assert.equal(topStyles(t, "top", 1)[0][0], "classic");
});

test("unlike takes the like back with the same rules", () => {
  const c = cat(), t = newTaste();
  applySignals(c, t, [likeSignal(true, 4, null).signal]);
  const liked = t.styles.top.reduce((a, v) => a + v, 0);
  const u = likeSignal(false, 4, { ids: [4], tg: null, og: "men" });
  assert.equal(u.signal.t, "unlike"); assert.equal(u.dir, "men");
  applySignals(c, t, [u.signal]);
  assert.ok(t.styles.top.reduce((a, v) => a + v, 0) < liked);
});

test("bottom-bar tap: results -> configurator, configurator -> results, nothing without a search, running search left alone", () => {
  assert.equal(tapAction("results", true), "open-config");
  assert.equal(tapAction("config", true), "back-to-results");
  assert.equal(tapAction("error", true), "back-to-results");
  assert.equal(tapAction("config", false), "none");
  assert.equal(tapAction("loading", true), "none");
});

test("Clear: offered only beyond the default direction; resets to the feed's direction with nothing selected", () => {
  assert.equal(canClear("women", "women", EMPTY_SEL, false), false);
  assert.equal(canClear("men", "women", EMPTY_SEL, false), true);
  assert.equal(canClear("women", "women", { ...EMPTY_SEL, item: "top" }, false), true);
  assert.equal(canClear("women", "women", EMPTY_SEL, true), true);
  const f = freshState("women"); assert.equal(f.dir, "women"); assert.equal(hasSel(f.sel), false);
  f.sel.item = "top"; assert.equal(hasSel(EMPTY_SEL), false);   // a fresh state never shares the empty object
});

test("kept selection (sessionStorage): round trip, junk and unknown options are refused", () => {
  const sel = { item: "shoes", family: "street", season: "winter", extra: "rain" } as const;
  assert.deepEqual(decodeState(encodeState("men", sel)), { dir: "men", sel });
  assert.equal(decodeState(null), null); assert.equal(decodeState("{"), null); assert.equal(decodeState('{"d":"kids","s":{}}'), null);
  assert.deepEqual(decodeState('{"d":"men","s":{"family":"boho","item":"top"}}'), { dir: "men", sel: { item: "top", family: null, season: null, extra: null } });
});

test("Highlight: strokes only while on; ?shine=0 forces them off", () => {
  assert.equal(shineVisible("", false), false);
  assert.equal(shineVisible("", true), true);
  assert.equal(shineVisible("?shine=0", true), false);
  assert.equal(shineVisible("?shine=1", true), true);
});
