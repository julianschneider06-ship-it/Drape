import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, type AccIn, type PieceIn, type Rect } from "../src/lib/layout/engine";
import { LAYOUT_SAFE_MARGIN as SAFE } from "../src/config/layout-safe";
import { PRICE_TAG } from "../src/config/search";
import { SIDE_BY_SIDE, SIDE_BY_SIDE_BOTTOM_OFFSET } from "../src/config/side-by-side";
import { placePriceTag, priceTagOn, priceTagSize, priceTagText } from "../src/lib/price-tag";
import { railIndex } from "../src/lib/rail-state";
import { seededRnd, wobblyBox } from "../src/lib/shine";

const pc = (slot: PieceIn["slot"], cls: PieceIn["cls"], aspect: number, presentation = "spread_front"): PieceIn => ({ slot, cls, aspect, presentation });
const acc = (slot: AccIn["slot"], type: string, aspect = 1.2, zone = "mid"): AccIn => ({ slot, type, size: "large", aspect, placement: "side", zone, frontFlat: false, beltShape: null });
const BIG = [acc("acc1", "ring", 1, "mid"), acc("acc2", "necklace", 1.1, "neck"), acc("acc3", "watch", 0.8, "sleeve"), acc("acc4", "bracelet", 1.3, "mid"), acc("acc5", "bag", 1.1, "hip"), acc("acc6", "sunglasses", 2.5, "upper"), acc("acc7", "hat", 1.4, "head")];
const mk = (folded: boolean, W: number, H: number, accessories: AccIn[], priceTag?: { slot: PieceIn["slot"]; w: number; h: number }) =>
  computeLayout({ kind: "three", pieces: { top: pc("top", "top", 1.1, folded ? "folded" : "spread_front"), bottom: pc("bottom", "trousers", folded ? 0.8 : 0.5, folded ? "folded" : "spread_front"), shoes: pc("shoes", "shoes", 1.5) }, seed: 3, canvas: { w: W, h: H }, accessories, priceTag });
const ov = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;

test("price text: current price in the stored currency; sale = the (lower) current price only; missing price = no tag", () => {
  assert.match(priceTagText({ price_cents: 12900, currency: "USD" })!, /129/);
  assert.match(priceTagText({ price_cents: 9900, currency: "EUR" })!, /99/);
  assert.notEqual(priceTagText({ price_cents: 9900, currency: "EUR" }), priceTagText({ price_cents: 9900, currency: "USD" }));
  const sale = { price_cents: 7000, compare_at_cents: 10000, currency: "USD" };
  assert.doesNotMatch(priceTagText(sale)!, /100/);
  assert.match(priceTagText(sale)!, /70/);
  assert.equal(priceTagText({ price_cents: null, currency: "USD" }), null);
  assert.equal(priceTagText({ price_cents: 0, currency: "USD" }), null);
});

test("?price=0 hides the tag, anything else shows it", () => {
  assert.equal(priceTagOn("?price=0"), false);
  assert.equal(priceTagOn("?price=1"), true);
  assert.equal(priceTagOn(""), true);
});

test("hand-drawn box is deterministic per seed and uses the shared wobble randomness", () => {
  assert.deepEqual(wobblyBox(60, 20, 7, PRICE_TAG), wobblyBox(60, 20, 7, PRICE_TAG));
  assert.notDeepEqual(wobblyBox(60, 20, 7, PRICE_TAG), wobblyBox(60, 20, 8, PRICE_TAG));
  assert.equal(wobblyBox(60, 20, 7, PRICE_TAG).length, 4);
  const a = seededRnd(5), b = seededRnd(5); assert.equal(a(), b());
});

test("price tag: below the lower-left corner when free, inside the card and safe area, off other pieces", () => {
  const canvas = { w: 340, h: 600 }, piece = { x: 40, y: 100, w: 120, h: 200 }, size = priceTagSize("$129.00");
  const p = placePriceTag("$129.00", piece, [{ x: 200, y: 100, w: 100, h: 300 }], canvas)!;
  assert.equal(p.spot, "below");
  assert.ok(Math.abs(p.rect.x - piece.x) < 1 && Math.abs(p.rect.w - size.w) < 0.01);
  assert.ok(p.rect.y >= piece.y + piece.h && p.rect.y + p.rect.h <= canvas.h - SAFE.bottom);
});

test("price tag: nudged to the nearest free spot, shrunk, or left out when there is no room", () => {
  const canvas = { w: 340, h: 600 };
  const low = { x: 40, y: 480, w: 120, h: 100 };   // no room below (safe area): goes left of it or inside
  const p = placePriceTag("$129.00", low, [], canvas)!;
  assert.notEqual(p.spot, "below");
  assert.ok(p.rect.y + p.rect.h <= canvas.h - SAFE.bottom + 0.01 && p.rect.x >= 0);
  const block = placePriceTag("$129.00", { x: 0, y: 100, w: 30, h: 20 }, [{ x: 0, y: 0, w: 340, h: 600 }], canvas);
  assert.equal(block, null);
});

test("price tag never overlaps another piece (stacked + side-by-side, big jewelry)", () => {
  for (const folded of [false, true]) for (const [W, H] of [[342, 640], [327, 520]]) {
    const size = priceTagSize("$1,249.00");
    for (const slot of ["top", "bottom", "shoes", "acc1", "acc3"] as const) {
      const l = mk(folded, W, H, BIG, { slot, w: size.w, h: size.h });
      const me = l.pieces.find((p) => p.slot === slot);
      if (!me) continue;
      const p = placePriceTag("$1,249.00", me.rect, l.pieces.filter((q) => q.slot !== slot).map((q) => q.rect), { w: W, h: H });
      if (!p) continue;
      assert.ok(p.rect.x >= 0 && p.rect.x + p.rect.w <= W && p.rect.y >= SAFE.top - 0.01 && p.rect.y + p.rect.h <= H - SAFE.bottom + 0.01, `${folded} ${W}x${H} ${slot}: inside`);
      for (const q of l.pieces) if (q.slot !== slot) assert.ok(!ov(p.rect, q.rect), `${folded} ${W}x${H} ${slot}: tag over ${q.slot}`);
    }
  }
});

for (const folded of [false, true]) for (const [W, H] of [[342, 640], [327, 520], [342, 452], [300, 400]]) {
  test(`safe area ${folded ? "side-by-side" : "stacked"} ${W}x${H}: every piece (big rings/chains + price tag) inside the margins, no overlaps`, () => {
    const size = priceTagSize("$1,249.00");
    for (const tag of [undefined, { slot: "shoes" as const, w: size.w, h: size.h }]) {
      const l = mk(folded, W, H, BIG, tag);
      for (const p of l.pieces) {
        assert.ok(p.rect.y >= SAFE.top - 0.05, `${p.slot} top ${p.rect.y}`);
        assert.ok(p.rect.y + p.rect.h <= H - SAFE.bottom + 0.05 - (tag && p.slot === tag.slot ? PRICE_TAG.gap + tag.h : 0), `${p.slot} bottom`);
      }
      for (const a of l.pieces) for (const b of l.pieces) if (a.slot < b.slot && !(["shoes"].includes(a.slot) || ["shoes"].includes(b.slot))) assert.ok(!ov(a.rect, b.rect), `${a.slot}/${b.slot}`);
    }
  });
}

test("safe-area scaling is uniform: side-by-side keeps the centre line and the 15% offset", () => {
  for (const [W, H] of [[342, 452], [300, 400]]) {
    const l = mk(true, W, H, BIG);
    const t = l.pieces.find((p) => p.slot === "top")!.rect, b = l.pieces.find((p) => p.slot === "bottom")!.rect;
    assert.ok(Math.abs(t.y + t.h / 2 - H * SIDE_BY_SIDE.centerY) < 0.05);
    assert.ok(Math.abs(b.y + b.h / 2 - (H / 2 + SIDE_BY_SIDE_BOTTOM_OFFSET * t.h)) < 0.05);
  }
});

test("a short viewport scales the stacked composition down, a roomy one leaves it alone", () => {
  const small = mk(false, 342, 300, BIG), big = mk(false, 342, 900, []);
  assert.ok((small.debug?.safeScale ?? 1) < 1);
  assert.equal(big.debug?.safeScale ?? 1, 1);   // at most a small shift, never a scale-down
});

test("rail state follows the nearest snap position and flips once at the halfway point", () => {
  assert.equal(railIndex(0, 600, 5), 0);
  assert.equal(railIndex(299, 600, 5), 0);
  assert.equal(railIndex(301, 600, 5), 1);
  assert.equal(railIndex(600, 600, 5), 1);
  assert.equal(railIndex(99999, 600, 5), 4);
  assert.equal(railIndex(-20, 600, 5), 0);
  assert.equal(railIndex(300, 0, 5), 0);
  assert.equal(railIndex(300, 600, 0), 0);
});

test("all four sides: nothing leaves the safe area (375 px phones, short heights, rail canvas, rings/necklaces), same shape for side-by-side", () => {
  for (const [W, H] of [[327, 560], [327, 480], [375, 600], [343, 520], [390, 640], [360, 420]] as const)
    for (const folded of [false, true])
      for (const accessories of [[], BIG, [acc("acc1", "ring", 1, "mid"), acc("acc2", "necklace", 1.1, "neck")]]) {
        const L = mk(folded, W, H, accessories);
        for (const p of L.pieces) {
          const r = p.rect, d = `${folded} ${W}x${H} ${p.slot}`;
          assert.ok(r.x >= SAFE.left - 0.05 && r.x + r.w <= W - SAFE.right + 0.05, `${d} x ${r.x}..${r.x + r.w}`);
          assert.ok(r.y >= SAFE.top - 0.05 && r.y + r.h <= H - SAFE.bottom + 0.05, `${d} y ${r.y}..${r.y + r.h}`);
        }
        if (folded) {   // centre line and 15% offset survive the scale-down
          const top = L.pieces.find((p) => p.slot === "top"), bot = L.pieces.find((p) => p.slot === "bottom");
          if (top && bot) { assert.ok(Math.abs(top.rect.y + top.rect.h / 2 - SIDE_BY_SIDE.centerY * H) < 1, "top centred on the line"); assert.ok(Math.abs((bot.rect.y + bot.rect.h / 2) - (top.rect.y + top.rect.h / 2) - SIDE_BY_SIDE_BOTTOM_OFFSET * top.rect.h) < 3, "15% offset"); }
        }
      }
});
