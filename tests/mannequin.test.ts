import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveMini, figureLeft, figureWidth, mannequinSpec, pieceColor, pieceHex } from "../src/lib/mannequin";
import { MANNEQUIN } from "../src/config/mannequin";
import { BAG_OPS, DECO_MAX_COUNT, FRONT_OPS, PIXEL_COLORS, PIXEL_GRID, PIXEL_KEYS, PIXEL_FIGURE_POSE, SIDE_OPS, WOMEN_FRONT_OPS } from "../src/config/pixel-figure";
import { clampLight, figureGrid, figureMarkup, figurePalette, luminance, shade, type FigureSpec } from "../src/lib/pixel-figure";
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
  for (const ops of [FRONT_OPS, WOMEN_FRONT_OPS, SIDE_OPS, BAG_OPS.front, BAG_OPS.side]) for (const [k, x, y, w, h] of ops) {
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

test("grid: hair instead of a hat turns the cuff row into skin, hat keeps it", () => {
  assert.equal(figureGrid("front", false, true)[4].slice(5, 15), "hhhhhhhhhh");
  assert.equal(figureGrid("front", false, false)[4].slice(5, 15), "SSSSSSSSSS");
  assert.equal(figureGrid("front", false, false)[3].slice(5, 15), "hhhhhhhhhh");   // row 3 stays the (hair) colour via the palette
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

test("outfit spec: headwear and bag only, others ignored, fixed fallbacks, outer layer as top", () => {
  const s = mannequinSpec(outfit(card("Tee", "top", { col: "white" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }),
    [acc("watch"), acc("cap", "red"), acc("beanie"), acc("sunglasses"), acc("bag", "brown"), acc("belt")]));
  assert.deepEqual(s, { top: "#ffffff", bottom: "#2f6fd0", shoes: "#1a1a1a", head: "#e0221b", bag: "#7b4a2d" });   // first head item only
  const n = mannequinSpec(outfit(card("Top", "top", null), card("Pants", "bottom", null), card("Shoe", "shoes", null), [acc("hat"), acc("backpack")]));
  assert.deepEqual(n, { top: "#4a4a4f", bottom: "#8fa0b3", shoes: "#f1efe9", head: MANNEQUIN.fallbackColor, bag: MANNEQUIN.fallbackColor });
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
  const m = figureGrid("front", false, true), w = figureGrid("front", false, false, "women");
  assert.notDeepEqual(w, m);
  assert.equal(w.length, 40); assert.ok(w.every((r) => r.length === 20));
  const count = (g: string[], ch: string) => g.join("").split(ch).length - 1;
  assert.equal(count(m, "H"), 30); assert.equal(count(w, "H"), 0); assert.equal(count(w, "h"), 0);   // no beanie
  assert.ok(count(w, "L") > 30 && w.slice(4, 12).some((r) => r.slice(16, 18) === "LL"));              // long hair, ponytail beside the body
  assert.ok(count(w, "B") < count(m, "B"));                                                          // slimmer top
  assert.equal(figureGrid("front", true, false, "women").some((r) => /[Xx]/.test(r)), true);
  assert.equal(figureGrid("front", false, false, "women").some((r) => /[Xx]/.test(r)), false);
  assert.deepEqual(figureGrid("side", false, true, "women"), figureGrid("side", false, true));       // other poses keep the men's shape
});

test("women's figure: selected by the spec's gender, colours still come from the outfit, headwear is ignored", () => {
  const o = outfit(card("Tee", "top", { col: "red" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }), [acc("cap", "green"), acc("bag", "brown")]);
  assert.equal(mannequinSpec(o).gender, undefined);   // men: no gender key
  const ws = mannequinSpec(o, "women");
  assert.equal(ws.gender, "women");
  assert.deepEqual([ws.top, ws.bottom, ws.shoes, ws.bag], ["#e0221b", "#2f6fd0", "#1a1a1a", "#7b4a2d"]);   // same colour rules as the men's figure
  const men = figureMarkup(mannequinSpec(o)), women = figureMarkup(ws);
  assert.notEqual(men, women);
  assert.ok(women.includes(PIXEL_COLORS.hair) && women.includes("#e0221b") && !women.includes("#2f9e5b"));   // hair, top colour; no green cap
  assert.ok(men.includes("#2f9e5b"));
  const same = { ...ws, head: null };
  assert.equal(figureMarkup(same), women);                                                                 // headwear never changes the women's figure
  assert.equal(figurePalette(spec({ gender: "women" })).L, PIXEL_COLORS.hair);
  const light = figurePalette(spec({ gender: "women", top: "#ffffff" }));
  assert.ok(luminance(light.B) <= 0.88);                                                                   // same brightness clamp
});
