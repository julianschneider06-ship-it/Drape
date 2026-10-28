import { test } from "node:test";
import assert from "node:assert/strict";
import { bottomShape, effectiveMini, figureLeft, figureWidth, mannequinSpec, pieceColor, shoeKind, topSpec } from "../src/lib/mannequin";
import { mannequinArt } from "../src/lib/mannequin-art";
import { MANNEQUIN } from "../src/config/mannequin";
import { DEFAULT_PREFS, cleanPrefs } from "../src/lib/shop-pref";
import type { FeedCard, FeedOutfit } from "../src/lib/types";

const card = (name: string, slot: string, mq?: Partial<NonNullable<FeedCard["mq"]>> | null, extra: Partial<FeedCard> = {}): FeedCard =>
  ({ id: 1, brand: "b", name, slot, image: "", bg: null, whiten: null, bbox: null, aspect: 1, price_cents: null, compare_at_cents: null, currency: null, url: "", store: "s", in_stock: true,
    mq: mq === null ? undefined : { sub: null, col: null, fit: null, sil: null, outer: false, ...mq }, ...extra }) as FeedCard;
const acc = (type: string, col: string | null = null) => ({ card: card(type, "accessory", { col }), type, placement: "side" as const, zone: null, size: null, front_flat: null, belt_shape: null });
const outfit = (top: FeedCard, bottom: FeedCard | null, shoes: FeedCard, accessories: ReturnType<typeof acc>[] = [], kind: "three" | "full" = "three") =>
  ({ kind, top, bottom, shoes, accessories }) as Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">;

test("shoes: boots and high-tops are high, everything else low, no data = low", () => {
  assert.equal(shoeKind(card("Chelsea Boot", "shoes")), "high");
  assert.equal(shoeKind(card("Court", "shoes", { sub: "high-top sneakers" })), "high");
  assert.equal(shoeKind(card("Leather Loafer", "shoes", { sub: "loafers" })), "low");
  assert.equal(shoeKind(card("Slide Sandal", "shoes")), "low");
  assert.equal(shoeKind(null), "low");
});

test("bottom: short / wide / slim, skirts map to the nearest shape, no data = slim", () => {
  assert.equal(bottomShape(card("Linen Shorts", "bottom")), "short");
  assert.equal(bottomShape(card("Mini Skirt", "bottom")), "short");
  assert.equal(bottomShape(card("Midi Skirt", "bottom", { sub: "midi skirt" })), "wide");
  assert.equal(bottomShape(card("Wide Leg Trousers", "bottom")), "wide");
  assert.equal(bottomShape(card("Trousers", "bottom", { fit: "loose" })), "wide");
  assert.equal(bottomShape(card("Trousers", "bottom", { sil: "flared" })), "wide");
  assert.equal(bottomShape(card("Skinny Jeans", "bottom")), "slim");
  assert.equal(bottomShape(card("Chinos", "bottom", { fit: "slim" })), "slim");
  assert.equal(bottomShape(card("Pants", "bottom", null)), "slim");
  assert.equal(bottomShape(null), "slim");
});

test("top: short sleeve, long sleeve, hooded, outer layer, dress", () => {
  assert.equal(topSpec(card("Cotton Tee", "top"), false).shape, "short");
  assert.equal(topSpec(card("Ribbed Tank", "top"), false).shape, "short");
  assert.equal(topSpec(card("Long Sleeve Tee", "top"), false).shape, "long");   // long sleeve beats "tee"
  assert.equal(topSpec(card("Wool Sweater", "top"), false).shape, "long");
  assert.equal(topSpec(card("Mystery top", "top", null), false).shape, "long");   // no data = default
  const h = topSpec(card("Zip Hoodie", "top"), false);
  assert.deepEqual([h.shape, h.hood], ["long", true]);
  assert.equal(topSpec(card("Plain", "top", null, { hood: true }), false).hood, true);   // the measured hood flag counts too
  assert.equal(topSpec(card("Plain Tee", "top"), false).hood, false);
  const o = topSpec(card("Bomber Jacket", "top", { outer: true, col: "olive" }), false);
  assert.deepEqual([o.shape, o.color], ["long", "#6b6b2a"]);   // outer layer = long sleeve in its own colour
  assert.equal(topSpec(card("Slip Dress", "full_body"), true).shape, "dress");
  assert.equal(topSpec(card("Maxi Dress", "full_body"), true).hem, "long");
  assert.equal(topSpec(card("Dress", "full_body", null), true).hem, MANNEQUIN.defaults.dressHem);
});

test("colour: first colour of the piece, grey when missing / multicolor / unknown", () => {
  assert.equal(pieceColor(card("x", "top", { col: "navy" })), "#1f2a55");
  assert.equal(pieceColor(card("x", "top", { col: "multicolor" })), MANNEQUIN.fallbackColor);
  assert.equal(pieceColor(card("x", "top", { col: "teal?" })), MANNEQUIN.fallbackColor);
  assert.equal(pieceColor(card("x", "top", null)), MANNEQUIN.fallbackColor);
  assert.equal(pieceColor(null), MANNEQUIN.fallbackColor);
});

test("outfit spec: accessories hinted (head, glasses, bag), others ignored, dress has no bottom", () => {
  const s = mannequinSpec(outfit(card("Tee", "top", { col: "white" }), card("Jeans", "bottom", { col: "blue" }), card("Boots", "shoes", { col: "black" }),
    [acc("watch"), acc("cap", "red"), acc("beanie"), acc("sunglasses"), acc("bag", "brown"), acc("belt")]));
  assert.deepEqual(s.head, { kind: "cap", color: "#e0221b" });   // first head item only
  assert.equal(s.glasses, true);
  assert.deepEqual(s.bag, { color: "#7b4a2d" });
  assert.equal(s.shoes.kind, "high");
  assert.equal(s.bottom?.shape, "slim");
  const d = mannequinSpec(outfit(card("Dress", "full_body", { col: "pink" }), null, card("Sandal", "shoes"), [], "full"));
  assert.equal(d.bottom, null);
  assert.equal(d.top.shape, "dress");
  assert.deepEqual([d.head, d.glasses, d.bag], [null, false, null]);
  // no data at all: defaults and grey
  const n = mannequinSpec(outfit(card("Top", "top", null), card("Pants", "bottom", null), card("Shoe", "shoes", null)));
  assert.deepEqual([n.top.shape, n.bottom?.shape, n.shoes.kind, n.top.color], ["long", "slim", "low", MANNEQUIN.fallbackColor]);
});

test("drawing is deterministic, uses the part colours and always has shoes, bottom and top", () => {
  const s = mannequinSpec(outfit(card("Hoodie", "top", { col: "red" }), card("Shorts", "bottom", { col: "navy" }), card("Boots", "shoes", { col: "black" }), [acc("sunglasses"), acc("bag", "green")]));
  assert.deepEqual(mannequinArt(s), mannequinArt(s));
  const parts = mannequinArt(s), fills = new Map(parts.map((p) => [p.key, p.fill]));
  assert.equal(fills.get("body"), "#e0221b"); assert.equal(fills.get("bottom"), "#1f2a55"); assert.equal(fills.get("shoeL"), "#1a1a1a");
  assert.ok(fills.has("hood") && fills.has("lensL") && fills.has("bag"));
  assert.ok(parts.every((p) => p.d.startsWith("M")));
  const dress = mannequinArt(mannequinSpec(outfit(card("Dress", "full_body"), null, card("Shoe", "shoes"), [], "full")));
  assert.ok(!dress.some((p) => p.key === "bottom") && dress.some((p) => p.key === "body"));
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

test("position: centred over the Wishlist tab (3rd of 4, or 2nd of 3 without Search), bar capped at its max width", () => {
  const w = figureWidth();
  assert.equal(figureLeft(400, true, w), Math.round(400 * 0.625 - w / 2 + MANNEQUIN.xShiftPx));
  assert.equal(figureLeft(400, false, w), Math.round(200 - w / 2 + MANNEQUIN.xShiftPx));
  const wide = 1000, barW = MANNEQUIN.barMaxWidthPx;
  assert.equal(figureLeft(wide, true, w), Math.round((wide - barW) / 2 + barW * 0.625 - w / 2 + MANNEQUIN.xShiftPx));
});
