import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveMini, figureLeft, figureWidth, headKey, legsKey, mannequinSpec, patternKey, pieceColor, pieceHex, torsoKey } from "../src/lib/mannequin";
import { MANNEQUIN } from "../src/config/mannequin";
import { BAG_OPS, BAG_TYPES, DECO_MAX_COUNT, FACE_BY_TYPE, FACE_KEYS, FACE_TEMPLATES, HEAD_BY_TYPE, HEAD_KEYS, HEAD_ROWS, HEAD_TEMPLATES, LEGS_OPS, PATTERN_BITMAPS, PATTERN_KEYS, PIXEL_COLORS, PIXEL_GRID, PIXEL_KEYS, PIXEL_FIGURE_POSE, SIDE_OPS, SHORTS_OPS,
  TORSO_BY_CATEGORY, TORSO_FALLBACK, TORSO_KEYS, TORSO_ROWS, TORSO_TEMPLATES, TORSO_Y } from "../src/config/pixel-figure";
import { clampLight, figureGrid, figureMarkup, figurePalette, luminance, patternColor, shade, type FigureSpec } from "../src/lib/pixel-figure";
import { pixelRects } from "../src/lib/pixel-art";
import { DEFAULT_PREFS, cleanPrefs } from "../src/lib/shop-pref";
import type { FeedCard, FeedOutfit } from "../src/lib/types";
const card = (name: string, slot: string, mq?: Partial<NonNullable<FeedCard["mq"]>> | null, extra: Partial<FeedCard> = {}): FeedCard =>
  ({ id: 1, brand: "b", name, slot, image: "", bg: null, whiten: null, bbox: null, aspect: 1, price_cents: null, compare_at_cents: null, currency: null, url: "", store: "s", in_stock: true,
    mq: mq === null ? undefined : { sub: null, col: null, fit: null, sil: null, outer: false, ...mq }, ...extra }) as FeedCard;
const acc = (type: string, col: string | null = null) => ({ card: card(type, "accessory", { col }), type, placement: "side" as const, zone: null, size: null, front_flat: null, belt_shape: null });
const outfit = (top: FeedCard, bottom: FeedCard | null, shoes: FeedCard, accessories: ReturnType<typeof acc>[] = [], kind: "three" | "full" = "three") =>
  ({ kind, top, bottom, shoes, accessories }) as Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">;

test("grid: every op lies inside 20x40 and uses a known key", () => {
  assert.deepEqual([PIXEL_GRID.w, PIXEL_GRID.h], [20, 40]);
  for (const ops of [LEGS_OPS.men, LEGS_OPS.women, SIDE_OPS, BAG_OPS.front, BAG_OPS.side]) for (const [k, x, y, w, h] of ops) {
    assert.ok(PIXEL_KEYS.includes(k), `key ${k}`);
    assert.ok(w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= 20 && y + h <= 40, `op ${k} ${x},${y} ${w}x${h}`);
  }
  for (const pose of ["front", "side"] as const) for (const bag of [false, true]) for (const hat of [false, true]) {
    const g = figureGrid(pose, bag, hat);
    assert.equal(g.length, 40);
    assert.ok(g.every((r) => r.length === 20 && [...r].every((ch) => ch === "." || PIXEL_KEYS.includes(ch))));
    assert.equal(g.some((r) => /[Xx]/.test(r)), bag);
  }
});

test("grid: beanie keeps its cuff rows, hair instead of a hat turns them into hair + forehead", () => {
  assert.equal(figureGrid("front", false, true)[4].slice(4, 16), "hhhhhhhhhhhh");
  assert.equal(figureGrid("front", false, false)[4].slice(5, 15), "SSSSSSSSSS");
  assert.equal(figureGrid("front", false, false)[3].slice(5, 15), "LLLLLLLLLL");
});

const spec = (o: Partial<FigureSpec> = {}): FigureSpec => ({ top: "#e0221b", bottom: "#1f2a55", shoes: "#1a1a1a", head: null, bag: null, ...o });

test("palette: shade factors, drawstrings, constants", () => {
  const p = figurePalette(spec({ head: "#2f9e5b", bag: "#7b4a2d" }));
  assert.equal(p.B, "#e0221b"); assert.equal(p.b, shade("#e0221b", 0.72));
  assert.equal(p.P, "#1f2a55"); assert.equal(p.p, shade("#1f2a55", 0.78)); assert.equal(p.q, shade("#1f2a55", 0.65));
  assert.equal(p.W, "#1a1a1a"); assert.equal(p.w, shade("#1a1a1a", 0.87)); assert.equal(p.v, shade("#1a1a1a", 0.71));
  assert.equal(p.H, "#2f9e5b"); assert.equal(p.h, shade("#2f9e5b", 0.81));
  assert.equal(p.X, "#7b4a2d"); assert.equal(p.x, shade("#7b4a2d", 0.7));
  assert.equal(p.S, "#e6c4a2"); assert.equal(p.K, "#1a1a1a");
  assert.equal(shade("#c8641e", 0.5), "#64320f");
  assert.equal(p.c, "#d8d8d8");                                              // dark hoodie: pale strings
  assert.equal(figurePalette(spec({ top: "#f3ead3" })).c, "#8a8a8a");        // light hoodie: grey strings
});

test("palette: no hat = hair colour, no bag = no bag colours", () => {
  const p = figurePalette(spec());
  assert.equal(p.H, "#3a2e28"); assert.equal(p.h, "#3a2e28");
  assert.ok(!("X" in p) && !("x" in p));
});

test("palette: light colours are mixed toward grey until luminance <= 0.88; dark ones are untouched", () => {
  assert.ok(luminance("#ffffff") > 0.99);
  const w = clampLight("#ffffff");
  assert.ok(luminance(w) <= 0.88 && luminance(w) > 0.8, w);
  assert.equal(clampLight("#1f2a55"), "#1f2a55");
  assert.equal(clampLight("#f3ead3"), "#f3ead3");                            // cream is under the limit
  const p = figurePalette(spec({ top: "#ffffff", shoes: "#ffffff", head: "#ffffff", bag: "#ffffff" }));
  for (const k of ["B", "P", "W", "H", "X"]) assert.ok(luminance(p[k]) <= 0.88, k);
  assert.equal(p.S, PIXEL_COLORS.skin);                                      // skin is never clamped
});

test("colour: first colour of the piece, null / grey when missing / multicolor / unknown", () => {
  assert.equal(pieceHex(card("x", "top", { col: "navy" })), "#1f2a55");
  assert.equal(pieceHex(card("x", "top", { col: "multicolor" })), null);
  assert.equal(pieceHex(null), null);
  assert.equal(pieceColor(card("x", "top", { col: "teal?" })), MANNEQUIN.fallbackColor);
  assert.equal(pieceColor(card("x", "top", null)), MANNEQUIN.fallbackColor);
});

test("outfit spec: head / face / bag templates, others ignored, fixed fallbacks, outer layer as top", () => {
  const s = mannequinSpec(outfit(card("Tee", "top", { col: "white" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }),
    [acc("watch"), acc("cap", "red"), acc("beanie"), acc("sunglasses"), acc("bag", "brown"), acc("belt")]));
  assert.deepEqual(s, { top: "#ffffff", bottom: "#2f6fd0", shoes: "#1a1a1a", head: "#e0221b", bag: "#7b4a2d", torso: "tee", headType: "cap", face: "sunglasses" });   // first head item only
  const n = mannequinSpec(outfit(card("Top", "top", null), card("Pants", "bottom", null), card("Shoe", "shoes", null), [acc("hat"), acc("backpack")]));
  assert.deepEqual(n, { top: "#4a4a4f", bottom: "#8fa0b3", shoes: "#f1efe9", head: MANNEQUIN.fallbackColor, bag: MANNEQUIN.fallbackColor, torso: "hoodie", headType: "hat", face: null });
  const none = mannequinSpec(outfit(card("Tee", "top", { col: "red" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }), [acc("watch")]));
  assert.deepEqual([none.head, none.bag], [null, null]);
  const o = mannequinSpec(outfit(card("Bomber", "top", { outer: true, col: "olive" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" })));
  assert.equal(o.top, "#6b6b2a");
});

test("one-piece: the dress colours both top and bottom", () => {
  const d = mannequinSpec(outfit(card("Dress", "full_body", { col: "pink" }), null, card("Sandal", "shoes", { col: "beige" }), [], "full"));
  assert.deepEqual([d.top, d.bottom], ["#f4a6c0", "#f4a6c0"]);
  const m = mannequinSpec(outfit(card("Dress", "full_body", null), null, card("Sandal", "shoes", null), [], "full"));
  assert.deepEqual([m.top, m.bottom], ["#4a4a4f", "#4a4a4f"]);
});

test("markup: horizontal runs of one colour merge, output is deterministic and cached per palette", () => {
  assert.deepEqual(pixelRects(["aab.a", "..bb."], { a: "#111", b: "#222" }), [
    { x: 0, y: 0, w: 2, h: 1, fill: "#111" }, { x: 2, y: 0, w: 1, h: 1, fill: "#222" }, { x: 4, y: 0, w: 1, h: 1, fill: "#111" }, { x: 2, y: 1, w: 2, h: 1, fill: "#222" }]);
  assert.deepEqual(pixelRects(["ab"], { a: "#111", b: "#111" }), [{ x: 0, y: 0, w: 2, h: 1, fill: "#111" }]);   // same colour under two keys merges too
  const m = figureMarkup(spec({ head: "#2f9e5b", bag: "#7b4a2d" }));
  assert.equal(m, figureMarkup(spec({ head: "#2f9e5b", bag: "#7b4a2d" })));
  assert.notEqual(m, figureMarkup(spec()));
  assert.notEqual(figureMarkup(spec()), figureMarkup(spec(), "side"));
  assert.ok(m.startsWith("<rect ") && !/stroke|opacity|filter|gradient/i.test(m));
  assert.ok(DECO_MAX_COUNT >= 1);
});

test("setting: link wins, otherwise the device choice; default on and saved with the profile", () => {
  assert.equal(effectiveMini(null, true), true);
  assert.equal(effectiveMini(null, false), false);
  assert.equal(effectiveMini("0", true), false);
  assert.equal(effectiveMini("1", false), true);
  assert.equal(effectiveMini("x", false), false);
  assert.equal(DEFAULT_PREFS.mini, true);
  assert.equal(cleanPrefs({ v: 1, mini: false }).mini, false);
  assert.equal(cleanPrefs({ v: 1, mini: "no" }).mini, true);
  assert.equal(cleanPrefs({ v: 1, season: false }).mini, true);   // old saves keep working
});

test("position: centred over the Profile tab (last of 4, or 3), bar capped at its max width", () => {
  assert.equal(MANNEQUIN.anchorTab, "profile");
  const w = figureWidth(), m = MANNEQUIN.safeMarginPx;
  assert.equal(figureLeft(400, true, w), Math.round(400 * 0.875 - w / 2 + MANNEQUIN.xShiftPx));
  assert.equal(figureLeft(400, false, w), Math.round(400 * (5 / 6) - w / 2 + MANNEQUIN.xShiftPx));
  const wide = 1000, barW = MANNEQUIN.barMaxWidthPx;
  assert.equal(figureLeft(wide, true, w), Math.round((wide - barW) / 2 + barW * 0.875 - w / 2 + MANNEQUIN.xShiftPx));
  for (const lw of [280, 320, 375, 430, 1000]) for (const s of [true, false]) {
    const l = figureLeft(lw, s, w);
    assert.ok(l >= m && l + w <= lw - m, `${lw} ${s}`);   // never cut off at the edge
  }
});

test("position: the safe right margin pulls the figure in when the tab centre is too close to the edge", () => {
  const w = figureWidth();
  assert.equal(figureLeft(60, false, w), Math.max(MANNEQUIN.safeMarginPx, 60 - MANNEQUIN.safeMarginPx - w));
});

test("women's figure: own slim shape, hair + ponytail instead of the beanie, same grid and optional bag", () => {
  assert.equal(PIXEL_FIGURE_POSE, "front");
  const m = figureGrid("front", false, true, "men", { head: "beanie" }), w = figureGrid("front", false, false, "women");
  assert.notDeepEqual(w, m);
  assert.equal(w.length, 40); assert.ok(w.every((r) => r.length === 20));
  const count = (g: string[], ch: string) => g.join("").split(ch).length - 1;
  assert.ok(count(m, "H") > 0); assert.equal(count(w, "H"), 0); assert.equal(count(w, "h"), 0);   // no beanie
  assert.ok(count(w, "L") > 30 && w.slice(4, 12).some((r) => r.slice(16, 18) === "LL"));              // long hair, ponytail beside the body
  assert.ok(count(w, "B") < count(m, "B"));                                                          // slimmer top
  assert.equal(figureGrid("front", true, false, "women").some((r) => /[Xx]/.test(r)), true);
  assert.equal(figureGrid("front", false, false, "women").some((r) => /[Xx]/.test(r)), false);
  assert.deepEqual(figureGrid("side", false, true, "women"), figureGrid("side", false, true));       // other poses keep the men's shape
});

test("women's figure: selected by the spec's gender, colours still come from the outfit, a cap hides the hair", () => {
  const o = outfit(card("Tee", "top", { col: "red" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }), [acc("cap", "green"), acc("bag", "brown")]);
  assert.equal(mannequinSpec(o).gender, undefined);   // men: no gender key
  const ws = mannequinSpec(o, "women");
  assert.equal(ws.gender, "women");
  assert.deepEqual([ws.top, ws.bottom, ws.shoes, ws.bag], ["#e0221b", "#2f6fd0", "#1a1a1a", "#7b4a2d"]);   // same colour rules as the men's figure
  const men = figureMarkup(mannequinSpec(o)), women = figureMarkup(ws);
  assert.notEqual(men, women);
  assert.ok(women.includes(PIXEL_COLORS.hair) && women.includes("#e0221b") && women.includes("#2f9e5b"));   // ponytail end, top colour, green cap
  assert.ok(men.includes("#2f9e5b"));
  const bare = { ...ws, head: null, headType: null };
  assert.notEqual(figureMarkup(bare), women);                                                              // the cap changes the women's figure too
  assert.equal(figurePalette(spec({ gender: "women" })).L, PIXEL_COLORS.hair);
  const light = figurePalette(spec({ gender: "women", top: "#ffffff" }));
  assert.ok(luminance(light.B) <= 0.88);                                                                   // same brightness clamp
});

// ---- ready-made templates ----

test("templates: every bitmap has the same width and the row count of its kind, and only known keys", () => {
  const W = PIXEL_GRID.w, keys = PIXEL_KEYS + ".";
  for (const g of ["men", "women"] as const) {
    for (const [set, rows, names] of [[TORSO_TEMPLATES[g], TORSO_ROWS, TORSO_KEYS], [HEAD_TEMPLATES[g], HEAD_ROWS, HEAD_KEYS], [FACE_TEMPLATES[g], HEAD_ROWS, FACE_KEYS]] as const) {
      assert.deepEqual(Object.keys(set).sort(), [...names].sort(), `${g} template names`);
      for (const [name, bm] of Object.entries(set)) {
        assert.equal(bm.length, rows, `${g} ${name} rows`);
        for (const r of bm) { assert.equal(r.length, W, `${g} ${name} width`); assert.ok([...r].every((c) => keys.includes(c)), `${g} ${name} key`); }
      }
    }
  }
  assert.ok(TORSO_Y + TORSO_ROWS <= PIXEL_GRID.h && HEAD_ROWS <= TORSO_Y + 2);
});

test("templates: lookup tables only point at existing templates; known categories, fallback, odd spellings", () => {
  for (const v of Object.values(TORSO_BY_CATEGORY)) assert.ok((TORSO_KEYS as readonly string[]).includes(v));
  for (const v of Object.values(HEAD_BY_TYPE)) assert.ok((HEAD_KEYS as readonly string[]).includes(v));
  for (const v of Object.values(FACE_BY_TYPE)) assert.ok((FACE_KEYS as readonly string[]).includes(v));
  assert.ok(Object.keys(TORSO_BY_CATEGORY).every((k) => k === k.toLowerCase()));
  const t = (sub: string | null) => torsoKey(card("x", "top", { sub }));
  assert.deepEqual(["hoodie", "sweatshirt", "bomber jacket", "blazer", "cardigan", "coat", "tshirt", "polo", "shirt", "tank top", "sweater", "jumper", "knit top", "turtleneck"].map(t),
    ["hoodie", "sweatshirt", "jacket", "jacket", "cardigan", "jacket", "tee", "tee", "tee", "tee", "sweater", "sweater", "sweater", "sweater"]);
  assert.equal(t("Bomber  Jacket"), "jacket"); assert.equal(t("T-Shirt"), "tee");   // case, spaces and hyphens do not matter
  assert.equal(t("spacesuit"), TORSO_FALLBACK); assert.equal(t(null), TORSO_FALLBACK); assert.equal(t("constructor"), TORSO_FALLBACK);
  assert.equal(torsoKey(card("x", "top", null)), TORSO_FALLBACK); assert.equal(torsoKey(null), TORSO_FALLBACK);
  assert.equal(TORSO_FALLBACK, "hoodie");
  assert.deepEqual([HEAD_BY_TYPE.cap, HEAD_BY_TYPE.beanie, HEAD_BY_TYPE.hat, HEAD_BY_TYPE.scarf], ["cap", "beanie", "hat", undefined]);
  assert.deepEqual([FACE_BY_TYPE.sunglasses, FACE_BY_TYPE.glasses, FACE_BY_TYPE.watch], ["sunglasses", "glasses", undefined]);
  assert.deepEqual(BAG_TYPES, ["bag", "backpack"]);
});

test("templates: selection from a sample outfit", () => {
  const base = [card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" })] as const;
  const a = mannequinSpec(outfit(card("Bomber", "top", { sub: "bomber jacket", col: "olive" }), base[0], base[1], [acc("beanie", "grey")]));
  assert.deepEqual([a.torso, a.headType, a.face], ["jacket", "beanie", null]);
  const b = mannequinSpec(outfit(card("Tee", "top", { sub: "tshirt", col: "white" }), base[0], base[1], [acc("cap", "red"), acc("sunglasses")]));
  assert.deepEqual([b.torso, b.headType, b.face], ["tee", "cap", "sunglasses"]);
  const c = mannequinSpec(outfit(card("Tee", "top", { sub: "tshirt" }), base[0], base[1], [acc("watch"), acc("glasses")]));
  assert.deepEqual([c.headType, c.head, c.face], [null, null, "glasses"]);
  const d = mannequinSpec(outfit(card("Odd", "top", { sub: "poncho" }), base[0], base[1]));
  assert.deepEqual([d.torso, d.headType, d.face, d.head], ["hoodie", null, null, null]);
});

test("templates: the grid shows the chosen templates (both genders), and face goes over any head", () => {
  const rows = (g: string[], y0: number, y1: number) => g.slice(y0, y1).join("");
  for (const gender of ["men", "women"] as const) {
    const jacket = figureGrid("front", false, false, gender, { torso: "jacket" }), tee = figureGrid("front", false, false, gender, { torso: "tee" }), hood = figureGrid("front", false, false, gender, { torso: "hoodie" });
    assert.ok(rows(jacket, 11, 28).includes("z") && !rows(hood, 11, 28).includes("z") && !rows(tee, 11, 28).includes("z"));
    assert.ok(rows(hood, 11, 28).includes("c") && !rows(tee, 11, 28).includes("c"));
    assert.notDeepEqual(jacket, tee);
    const heads = (["none", "beanie", "cap", "hat"] as const).map((h) => figureGrid("front", false, true, gender, { head: h }));
    assert.equal(new Set(heads.map((g) => g.join())).size, 4);
    for (const face of ["sunglasses", "glasses"] as const) for (const h of ["none", "beanie", "cap", "hat"] as const) {
      const g = figureGrid("front", false, true, gender, { head: h, face }), key = face === "sunglasses" ? "G" : "F";
      assert.ok(rows(g, 0, 11).includes(key), `${gender} ${h} ${face}`);
      assert.notDeepEqual(g, figureGrid("front", false, true, gender, { head: h }));
    }
  }
  // cap: brim wider than the head; beanie: folded cuff row wider than the head; hat: brim all around (widest)
  const span = (r: string) => r.replace(/\./g, " ").trimEnd().length - r.replace(/\./g, " ").search(/\S/);
  const m = (h: "cap" | "beanie" | "hat") => figureGrid("front", false, true, "men", { head: h });
  assert.equal(span(m("cap")[4]), 13); assert.equal(span(m("beanie")[3]), 12); assert.ok(span(m("hat")[3]) > span(m("cap")[4]));
  // women: long hair with no head accessory, only the ponytail end with one
  const wn = figureGrid("front", false, false, "women", { head: "none" }).join(""), wc = figureGrid("front", false, true, "women", { head: "cap" }).join("");
  assert.ok(wn.split("L").length - 1 > 30 && wc.split("L").length - 1 > 0 && wc.split("L").length - 1 < 15);
  // spec -> markup: same templates and colours give the same cached markup; a different template differs
  const o = (sub: string) => mannequinSpec(outfit(card("T", "top", { sub, col: "red" }), card("J", "bottom", { col: "blue" }), card("B", "shoes", { col: "black" })));
  assert.equal(figureMarkup(o("blazer")), figureMarkup(o("coat")));
  assert.notEqual(figureMarkup(o("blazer")), figureMarkup(o("tshirt")));
});

const T = (name: string, sub: string | null, extra: Partial<NonNullable<FeedCard["mq"]>> = {}) => card(name, "top", { sub, ...extra });

test("templates: title keywords only decide for an unknown category; known category wins; unknown stays hoodie", () => {
  const k = (name: string, sub: string | null = "mystery") => torsoKey(T(name, sub));
  assert.deepEqual([k("Merino Crewneck"), k("Wool Cardigan"), k("Chunky Knit"), k("Cotton Jumper"), k("Zip Hooded Top"), k("Oxford Shirt")], ["sweatshirt", "cardigan", "sweater", "sweater", "hoodie", "tee"]);
  assert.equal(k("Knit Polo", "tshirt"), "tee");                 // known category wins
  assert.equal(k("Plain thing"), TORSO_FALLBACK); assert.equal(k("", null), TORSO_FALLBACK);
  assert.equal(k("Sweatshirt dress"), "sweatshirt");             // whole words: "sweatshirt" is not "shirt"
});

test("shorts: category or title word, everything else keeps trousers", () => {
  const b = (name: string, sub: string | null) => legsKey(card(name, "bottom", { sub }));
  assert.equal(b("Chino", "shorts"), "shorts"); assert.equal(b("x", "Denim Shorts"), "shorts"); assert.equal(b("x", "skort"), "shorts");
  assert.equal(b("Linen Bermuda", "trousers"), "shorts"); assert.equal(b("Short Length Pant", null), "shorts");
  assert.equal(b("Straight Jeans", "jeans"), "trousers"); assert.equal(b("Shortbread Pant", "pants"), "trousers"); assert.equal(legsKey(null), "trousers");
  const o = (bottom: FeedCard, kind: "three" | "full" = "three") => mannequinSpec(outfit(card("t", "top", { col: "red" }), bottom, card("s", "shoes")), "men").legs;
  assert.equal(o(card("x", "bottom", { sub: "shorts" })), "shorts"); assert.equal(o(card("x", "bottom", { sub: "jeans" })), undefined);
  assert.equal(mannequinSpec(outfit(card("d", "full_body", { sub: "dress" }), null, card("s", "shoes"), [], "full")).legs, undefined);
  for (const g of ["men", "women"] as const) {   // the grid: bare lower legs, same shoes, nothing outside the figure
    const rows = figureGrid("front", false, false, g, { legs: "shorts" });
    assert.equal(rows.length, 40); assert.ok(rows.every((r) => r.length === 20));
    assert.ok(rows[36].includes("S") && rows[38].includes("W") && rows[39].includes("w"));
    assert.ok(!figureGrid("front", false, false, g).slice(35, 38).some((r) => r.includes("S")));
    for (const [key, x, y, w, h] of SHORTS_OPS[g]) assert.ok(PIXEL_KEYS.includes(key) && x >= 0 && y >= 0 && x + w <= 20 && y + h <= 40);
  }
});

test("cap: brim only on the left, hat keeps the all-around brim, a cap filed as hat is fixed by its title", () => {
  for (const g of ["men", "women"] as const) {
    const brim = HEAD_TEMPLATES[g].cap[4], hat = HEAD_TEMPLATES[g].hat[3];
    const cols = (r: string) => [...r].map((c, i) => (c === "h" ? i : -1)).filter((i) => i >= 0);
    const head = HEAD_TEMPLATES[g].cap[3], crown = cols(head.replace(/H/g, "h"));
    assert.ok(Math.min(...cols(brim)) < Math.min(...crown), `${g} cap brim sticks out on the left`);
    assert.ok(Math.max(...cols(brim)) <= Math.max(...crown), `${g} cap brim does not stick out on the right`);
    assert.ok(Math.min(...cols(hat)) < Math.min(...crown) && Math.max(...cols(hat)) > Math.max(...crown), `${g} hat brim all around`);
  }
  assert.equal(headKey("cap", "x"), "cap"); assert.equal(headKey("hat", "Wide Brim Hat"), "hat"); assert.equal(headKey("hat", "Baseball Cap"), "cap");
  assert.equal(headKey("hat", "Knit Beanie"), "beanie"); assert.equal(headKey("beanie", "Cap Beanie"), "beanie"); assert.equal(headKey("scarf", "cap"), null);
  assert.equal(mannequinSpec(outfit(card("t", "top"), card("b", "bottom"), card("s", "shoes"), [acc("hat", "black")].map((a) => ({ ...a, card: card("Snapback Cap", "accessory", { col: "black" }) })))).headType, "cap");
});

test("patterns: attribute first, title keywords as fallback, solid otherwise", () => {
  const p = (name: string, pat: string | null | undefined) => patternKey(T(name, "tshirt", { pat }));
  assert.deepEqual([p("x", "stripes"), p("x", "checks"), p("x", "dots"), p("x", "graphic"), p("x", "logo")], ["stripes", "checks", "dots", "print", "print"]);
  assert.equal(p("Striped tee", "solid"), null);                          // a solid attribute wins over the title
  assert.deepEqual([p("Breton Striped Tee", null), p("Gingham Shirt", undefined), p("Fair Isle Knit", "other"), p("Polka Blouse", "floral"), p("Logo Tee", null), p("Graphic Print Tee", null)],
    ["stripes", "checks", "checks", "dots", "print", "print"]);
  assert.equal(p("Plain Tee", null), null); assert.equal(p("Plain Tee", "floral"), null); assert.equal(patternKey(null), null);
  const spec = mannequinSpec(outfit(card("Striped tee", "top", { col: "navy", col2: "white", pat: "stripes" }), card("b", "bottom"), card("s", "shoes")));
  assert.equal(spec.pattern, "stripes"); assert.equal(spec.accent, pieceHex(card("x", "top", { col: "white" })));
  assert.equal(mannequinSpec(outfit(card("Plain", "top", { col: "navy" }), card("b", "bottom"), card("s", "shoes"))).pattern, undefined);
});

test("patterns: second colour fallback, torso mask, bitmap sizes", () => {
  assert.equal(patternColor("#123456", "#ff0000"), "#ff0000");
  assert.ok(luminance(patternColor("#f0f0f0", null)) < luminance("#f0f0f0"));      // light top: darker variant
  assert.ok(luminance(patternColor("#10203a", null)) > luminance("#10203a"));      // dark top: lighter variant
  assert.ok(luminance(patternColor("#ffffff", "#ffffff")) <= 0.88);                // same brightness clamp as every outfit colour
  assert.ok(figurePalette(spec({ pattern: "dots", accent: "#00aa00" })).Q === "#00aa00" && !("Q" in figurePalette(spec())));
  assert.deepEqual(Object.keys(PATTERN_BITMAPS).sort(), [...PATTERN_KEYS].sort());
  for (const g of ["men", "women"] as const) for (const t of TORSO_KEYS) for (const pk of PATTERN_KEYS) {
    const bm = PATTERN_BITMAPS[pk];
    assert.equal(bm.length, TORSO_ROWS); assert.ok(bm.every((r) => r.length === PIXEL_GRID.w && /^[.1]+$/.test(r)));
    const plain = figureGrid("front", false, false, g, { torso: t }), pat = figureGrid("front", false, false, g, { torso: t, pattern: pk });
    let painted = 0;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 20; x++) if (plain[y][x] !== pat[y][x]) {
      painted++; const tc = TORSO_TEMPLATES[g][t][y - TORSO_Y]?.[x];
      assert.ok(tc === "B" || tc === "b", `${g} ${t} ${pk} only inside torso body cells`); assert.ok(pat[y][x] === "Q" || pat[y][x] === "y");
    }
    assert.ok(painted > 0, `${g} ${t} ${pk} paints something`);
  }
  assert.notEqual(figureMarkup(spec({ torso: "tee" })), figureMarkup(spec({ torso: "tee", pattern: "stripes" })));
});
