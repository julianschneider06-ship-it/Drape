import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, type AccIn, type PieceIn, type Rect } from "../src/lib/layout/engine";
import { SIDE_BY_SIDE, SIDE_BY_SIDE_BOTTOM_OFFSET } from "../src/config/side-by-side";

const pc = (slot: PieceIn["slot"], cls: PieceIn["cls"], aspect: number, presentation = "spread_front"): PieceIn => ({ slot, cls, aspect, presentation });
const acc = (slot: AccIn["slot"], type: string, aspect = 1.2, zone = "mid"): AccIn => ({ slot, type, size: "medium", aspect, placement: "side", zone, frontFlat: false, beltShape: null });
const ACCS = [acc("acc1", "hat", 1.4, "head"), acc("acc2", "sunglasses", 2.5, "upper"), acc("acc3", "watch", 0.8, "sleeve"), acc("acc4", "ring", 1), acc("acc5", "bag", 1.1, "hip"), acc("acc6", "necklace", 1, "neck")];
const folded = (W: number, H: number, accessories: AccIn[] = ACCS) =>
  computeLayout({ kind: "three", pieces: { top: pc("top", "top", 1.1, "folded"), bottom: pc("bottom", "trousers", 0.8, "folded"), shoes: pc("shoes", "shoes", 1.5) }, seed: 1, canvas: { w: W, h: H }, accessories });
const rect = (l: ReturnType<typeof folded>, slot: string) => l.pieces.find((p) => p.slot === slot)!.rect;
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;

for (const [W, H] of [[390, 700], [375, 548], [430, 760]]) {
  test(`side-by-side ${W}x${H}: top on the centre line, bottom 15% of the top's height lower`, () => {
    const l = folded(W, H);
    assert.equal(l.debug?.mode, "folded");
    const t = rect(l, "top"), b = rect(l, "bottom");
    assert.ok(Math.abs(t.y + t.h / 2 - H * SIDE_BY_SIDE.centerY) < 0.01);
    assert.ok(Math.abs(b.y + b.h / 2 - (H / 2 + SIDE_BY_SIDE_BOTTOM_OFFSET * t.h)) < 0.01);
    assert.ok(b.x > t.x + t.w - 0.01, "bottom right of the top");
  });
  test(`side-by-side ${W}x${H}: head items + glasses above the line, shoes + accessories below, nothing overlaps or leaves the card`, () => {
    const l = folded(W, H);
    const cy = H / 2;
    for (const p of l.pieces) {
      const r = p.rect;
      assert.ok(r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= W + 0.01 && r.y + r.h <= H + 0.01, `${p.slot} inside the card`);
      if (["acc1", "acc2"].includes(p.slot)) assert.ok(r.y + r.h <= cy + 0.01, `${p.slot} above the line`);
      if (["shoes", "acc3", "acc4", "acc5", "acc6"].includes(p.slot)) assert.ok(r.y >= cy - 0.01, `${p.slot} below the line`);
    }
    for (let i = 0; i < l.pieces.length; i++) for (let j = i + 1; j < l.pieces.length; j++) assert.ok(!overlap(l.pieces[i].rect, l.pieces[j].rect), `${l.pieces[i].slot} / ${l.pieces[j].slot}`);
    assert.equal(l.pieces.filter((p) => p.slot.startsWith("acc")).length + (l.debug?.acc?.dropped.length ?? 0), ACCS.length);
  });
}
test("side-by-side: empty zones leave no gap problems (no accessories, only glasses, only bag)", () => {
  for (const a of [[], [ACCS[1]], [ACCS[4]]]) {
    const l = folded(390, 700, a);
    assert.equal(l.pieces.length, 3 + a.length);
  }
});
test("stacked layout stays: top above bottom on one axis, no side-by-side offset", () => {
  const l = computeLayout({ kind: "three", pieces: { top: pc("top", "top", 1.1), bottom: pc("bottom", "trousers", 0.5), shoes: pc("shoes", "shoes", 1.5) }, seed: 1, canvas: { w: 390, h: 700 } });
  assert.equal(l.debug?.mode, "stacked");
  const t = rect(l, "top"), b = rect(l, "bottom");
  assert.ok(b.y >= t.y + t.h - 0.01);
  assert.ok(Math.abs(t.x + t.w / 2 - (b.x + b.w / 2)) < 0.01);
});
