import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, type AccIn, type PieceIn, type Rect } from "../src/lib/layout/engine";
import { HIT_ICON_ZONE, HIT_PADDING, hitCategory } from "../src/config/hit-area";
import { hitInsets, insetsToRect, type HitPiece } from "../src/lib/hit-areas";

const pc = (slot: PieceIn["slot"], cls: PieceIn["cls"], aspect: number, presentation = "spread_front"): PieceIn => ({ slot, cls, aspect, presentation });
const acc = (slot: AccIn["slot"], type: string, aspect = 1.2, zone = "mid"): AccIn => ({ slot, type, size: "medium", aspect, placement: "side", zone, frontFlat: false, beltShape: null });
const ACCS = [acc("acc1", "hat", 1.4, "head"), acc("acc2", "sunglasses", 2.5, "upper"), acc("acc3", "watch", 0.8, "sleeve"), acc("acc4", "ring", 1), acc("acc5", "bag", 1.1, "hip"), acc("acc6", "necklace", 1, "neck"), acc("acc7", "bracelet", 1.5), acc("acc8", "belt", 2.5)];
const strict = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
const typeOf = (slot: string) => ACCS.find((a) => a.slot === slot)?.type;

function areas(presentation: string, W: number, H: number, accessories: AccIn[], reserve = false) {
  const l = computeLayout({ kind: "three", pieces: { top: pc("top", "top", 1.1, presentation), bottom: pc("bottom", "trousers", 0.8, presentation), shoes: pc("shoes", "shoes", 1.5) }, seed: 3, canvas: { w: W, h: H }, accessories });
  const pieces: HitPiece[] = l.pieces.map((p) => ({ slot: p.slot, rect: p.rect, cat: hitCategory(p.slot, typeOf(p.slot)) }));
  const ins = hitInsets(pieces, { w: W, h: H }, reserve ? [HIT_ICON_ZONE] : []);
  return { pieces, ins, rects: pieces.map((p) => ({ slot: p.slot, vis: p.rect, hit: insetsToRect(p.rect, ins[p.slot]) })) };
}

test("categories: garments and shoes are small, accessories large, from the config", () => {
  assert.equal(hitCategory("top"), "garment");
  assert.equal(hitCategory("full"), "garment");
  assert.equal(hitCategory("shoes"), "shoes");
  assert.equal(hitCategory("acc1", "ring"), "jewelry");
  assert.equal(hitCategory("acc1", "sunglasses"), "glasses");
  assert.equal(hitCategory("acc1", "beanie"), "head");
  assert.equal(hitCategory("acc1", "bag"), "bag");
  assert.equal(hitCategory("acc1", "belt"), "belt");
  assert.equal(hitCategory("acc1", "scarf"), "accessory");
  assert.equal(HIT_PADDING.garment, 4);
  assert.equal(HIT_PADDING.jewelry, 14);
});

test("extension per category from the config when nothing is near", () => {
  const ins = hitInsets([{ slot: "top", rect: { x: 100, y: 100, w: 50, h: 50 }, cat: "garment" }, { slot: "acc1", rect: { x: 250, y: 300, w: 30, h: 30 }, cat: "jewelry" }], { w: 400, h: 600 });
  assert.deepEqual(ins.top, { l: 4, t: 4, r: 4, b: 4 });
  assert.deepEqual(ins.acc1, { l: 14, t: 14, r: 14, b: 14 });
});

test("midpoint split when two pieces are close", () => {
  const a: HitPiece = { slot: "acc1", rect: { x: 100, y: 100, w: 20, h: 20 }, cat: "jewelry" }, b: HitPiece = { slot: "acc2", rect: { x: 130, y: 100, w: 20, h: 20 }, cat: "jewelry" };   // gap 10
  const ins = hitInsets([a, b], { w: 400, h: 600 });
  assert.equal(ins.acc1.r, 5); assert.equal(ins.acc2.l, 5);
  assert.equal(ins.acc1.l, 14); assert.equal(ins.acc1.t, 14);   // free sides keep the full padding
  assert.ok(!strict(insetsToRect(a.rect, ins.acc1), insetsToRect(b.rect, ins.acc2)));
});

test("no extension into the card edge and into blocked zones; visible rects are never shrunk", () => {
  const ins = hitInsets([{ slot: "acc1", rect: { x: 3, y: 40, w: 20, h: 20 }, cat: "jewelry" }], { w: 400, h: 600 }, [{ x: 0, y: 0, w: 100, h: 34 }]);
  assert.equal(ins.acc1.l, 3);
  assert.equal(ins.acc1.t, 6);   // zone ends at y=34, piece starts at 40
  assert.equal(ins.acc1.r, 14);
  const touching = hitInsets([{ slot: "top", rect: { x: 0, y: 0, w: 100, h: 100 }, cat: "garment" }, { slot: "bottom", rect: { x: 50, y: 60, w: 100, h: 100 }, cat: "garment" }], { w: 400, h: 600 });
  for (const s of ["top", "bottom"]) for (const v of Object.values(touching[s])) assert.ok(v >= 0);
});

for (const mode of ["spread_front", "folded"]) for (const [W, H] of [[390, 700], [375, 548], [430, 760]]) {
  test(`${mode} ${W}x${H} with big ring/necklace/bracelet/watch: areas never overlap (visible pairs aside), stay in the card, never below the icons`, () => {
    const { rects, ins } = areas(mode, W, H, ACCS, true);
    for (const r of rects) {
      assert.ok(r.hit.x >= -0.01 && r.hit.y >= -0.01 && r.hit.x + r.hit.w <= W + 0.01 && r.hit.y + r.hit.h <= H + 0.01, `${r.slot} inside the card`);
      assert.ok(r.hit.w >= r.vis.w - 0.01 && r.hit.h >= r.vis.h - 0.01, `${r.slot} covers its visible image`);
    }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      if (strict(rects[i].vis, rects[j].vis)) continue;   // visibly overlapping (stacked) pieces: z-order decides, no extension toward each other
      assert.ok(!strict(rects[i].hit, rects[j].hit), `${rects[i].slot} / ${rects[j].slot}`);
    }
    for (const r of rects) {   // an extension never covers another piece's visible image
      for (const o of rects) if (o !== r && !strict(r.vis, o.vis)) assert.ok(!strict(r.hit, o.vis), `${r.slot} extension over ${o.slot}`);
      const z = { x: HIT_ICON_ZONE.x, y: HIT_ICON_ZONE.y, w: HIT_ICON_ZONE.w, h: HIT_ICON_ZONE.h };
      if (!strict(r.vis, z)) assert.ok(!strict(r.hit, z), `${r.slot} extension into the icons`);
    }
    assert.ok(ins.shoes.l <= HIT_PADDING.shoes);
  });
}
