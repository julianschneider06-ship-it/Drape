import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLayout, canvasSize, type AccIn, type PieceIn } from "../src/lib/layout/engine";
import { ACTION_RAIL_WIDTH } from "../src/config/action-rail";
import { HIT_ICON_ZONE, hitCategory } from "../src/config/hit-area";
import { hitInsets, insetsToRect } from "../src/lib/hit-areas";
import { heartState, heartToggle, outfitPieces } from "../src/lib/outfit-heart";
import type { FeedOutfit } from "../src/lib/types";

test("heart state: all / partly / none; an empty outfit is never filled", () => {
  assert.equal(heartState([1, 2, 3], new Set([1, 2, 3, 9])), "all");
  assert.equal(heartState([1, 2, 3], new Set([2])), "partly");
  assert.equal(heartState([1, 2, 3], new Set([7])), "none");
  assert.equal(heartState([], new Set([1])), "none");
});

test("heart tap: partly -> like only the missing; all -> unlike all; none -> like all", () => {
  assert.deepEqual(heartToggle([1, 2, 3], new Set([2])), { want: true, ids: [1, 3] });
  assert.deepEqual(heartToggle([1, 2, 3], new Set([1, 2, 3])), { want: false, ids: [1, 2, 3] });
  assert.deepEqual(heartToggle([1, 2, 3], new Set()), { want: true, ids: [1, 2, 3] });
});

const card = (id: number, cutout = true) => ({ id, cutout }) as never;
const outfit = { kind: "three", top: card(1), bottom: card(2), shoes: card(3), accessories: [{ card: card(4), slot_no: 1 }, { card: card(5, false), slot_no: 2 }, { card: card(6), slot_no: 3 }, { card: card(1), slot_no: 4 }] } as unknown as FeedOutfit;

test("outfit pieces: every placed piece incl. accessories, no duplicates, dropped slots are left out", () => {
  assert.deepEqual(outfitPieces(outfit).map((c) => c.id), [1, 2, 3, 4, 6]);
  assert.deepEqual(outfitPieces(outfit, ["top", "bottom", "shoes", "acc1"]).map((c) => c.id), [1, 2, 3, 4]);
});

test("canvas: the rail width is reserved on the right and the button bar is gone", () => {
  const old = canvasSize(390, 700), feed = canvasSize(390, 700, 0, { barPx: 0, railPx: ACTION_RAIL_WIDTH });
  assert.equal(feed.w + ACTION_RAIL_WIDTH, old.w);
  assert.ok(feed.h > old.h);
  assert.ok(ACTION_RAIL_WIDTH >= 44);
});

test("layout on the reduced canvas: no piece or tap area reaches under the rail", () => {
  const pc = (slot: PieceIn["slot"], cls: PieceIn["cls"], aspect: number): PieceIn => ({ slot, cls, aspect, presentation: "spread_front" });
  const acc = (slot: AccIn["slot"], type: string, aspect: number, zone: string): AccIn => ({ slot, type, size: "medium", aspect, placement: "side", zone, frontFlat: false, beltShape: null });
  const accs = [acc("acc1", "hat", 1.4, "head"), acc("acc2", "sunglasses", 2.5, "upper"), acc("acc3", "watch", 0.8, "sleeve"), acc("acc4", "ring", 1, "mid"), acc("acc5", "bag", 1.1, "hip"), acc("acc6", "necklace", 1, "neck")];
  for (const vw of [320, 375, 390, 430]) for (const seed of [1, 2, 3]) {
    const canvas = canvasSize(vw, 800, 0, { barPx: 0, railPx: ACTION_RAIL_WIDTH });
    const l = computeLayout({ kind: "three", pieces: { top: pc("top", "top", 1.1), bottom: pc("bottom", "trousers", 0.8), shoes: pc("shoes", "shoes", 1.5) }, seed, canvas, accessories: accs });
    const pieces = l.pieces.map((p) => ({ slot: p.slot, rect: p.rect, cat: hitCategory(p.slot, accs.find((a) => a.slot === p.slot)?.type) }));
    const ins = hitInsets(pieces, canvas, [HIT_ICON_ZONE]);
    for (const p of pieces) {
      const h = insetsToRect(p.rect, ins[p.slot]);
      assert.ok(p.rect.x >= -0.5 && p.rect.x + p.rect.w <= canvas.w + 0.5, `${vw} ${p.slot} visible inside`);
      assert.ok(h.x >= -0.5 && h.x + h.w <= canvas.w + 0.5, `${vw} ${p.slot} hit area inside`);
    }
  }
});
