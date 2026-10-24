import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bottomLocked, canSave, deleteOutfit, emptyDraft, emptyStore, filledCount, fitsSlot, fromSaved, isGreyId, missingRequired, parseStore, pickerItems, saveOutfit, serializeStore, setSlot, toSaved,
} from "../src/lib/my-outfits";
import { MY_OUTFITS_ACC_PLACEHOLDERS, MY_OUTFITS_ACC_SLOTS, MY_OUTFITS_MAX_SAVED } from "../src/config/my-outfits";
import type { FeedCard } from "../src/lib/types";

const card = (id: number, slot: string) => ({ id, slot, brand: "b", name: "n" }) as FeedCard;
const TOP = card(1, "top"), TOP2 = card(2, "top"), DRESS = card(3, "full_body"), PANTS = card(4, "bottom"), SHOE = card(5, "shoes"), CAP = card(6, "accessory"), CAP2 = card(7, "accessory");

test("slot rules: categories per slot", () => {
  assert.ok(fitsSlot("top", TOP) && fitsSlot("top", DRESS) && !fitsSlot("top", PANTS));
  assert.ok(fitsSlot("bottom", PANTS) && !fitsSlot("bottom", SHOE));
  assert.ok(fitsSlot("shoes", SHOE) && !fitsSlot("shoes", CAP));
  assert.ok(fitsSlot({ acc: 0 }, CAP) && !fitsSlot({ acc: 0 }, TOP));
  const d = setSlot(emptyDraft(), "bottom", TOP);   // wrong category: unchanged
  assert.equal(d.bottom, null);
});

test("a new outfit has MY_OUTFITS_ACC_SLOTS empty accessory slots, all optional and any accessory type", () => {
  const d = emptyDraft();
  assert.equal(d.acc.length, MY_OUTFITS_ACC_SLOTS);
  assert.ok(d.acc.every((x) => x === null));
  assert.ok(MY_OUTFITS_ACC_PLACEHOLDERS.length >= MY_OUTFITS_ACC_SLOTS);
  const two = setSlot(setSlot(d, { acc: 0 }, CAP), { acc: MY_OUTFITS_ACC_SLOTS - 1 }, CAP2);   // any accessory in any slot
  assert.deepEqual([two.acc[0], two.acc[MY_OUTFITS_ACC_SLOTS - 1]], [6, 7]);
});

test("the same product cannot sit twice; two different caps are fine", () => {
  let d = setSlot(emptyDraft(), { acc: 0 }, CAP);
  assert.deepEqual(setSlot(d, { acc: 1 }, CAP), d);
  d = setSlot(d, { acc: 1 }, CAP2);
  assert.deepEqual(d.acc.slice(0, 2), [6, 7]);
  assert.deepEqual(setSlot(d, { acc: 0 }, CAP).acc.slice(0, 2), [6, 7]);   // re-picking the own piece keeps it
  assert.deepEqual(pickerItems([CAP, CAP2, TOP], d, { acc: 0 }).map((c) => c.id), [6]);   // CAP2 is in another slot; TOP is no accessory
});

test("a one-piece in Top empties and locks Bottom; clearing works", () => {
  let d = setSlot(setSlot(emptyDraft(), "top", TOP), "bottom", PANTS);
  d = setSlot(d, "top", DRESS);
  assert.equal(d.bottom, null);
  assert.ok(bottomLocked(DRESS) && !bottomLocked(TOP));
  assert.equal(setSlot(d, "top", null).top, null);
  assert.equal(setSlot(d, "top", TOP2).top, 2);
});

test("save needs Top, Bottom and Shoes; accessories are optional; a one-piece covers Bottom", () => {
  let d = emptyDraft();
  assert.deepEqual(missingRequired(d, false), ["Top", "Bottom", "Shoes"]);
  assert.equal(canSave(d, false), false);
  d = setSlot(d, "shoes", SHOE);
  assert.deepEqual(missingRequired(d, false), ["Top", "Bottom"]);
  d = setSlot(d, "top", TOP);
  assert.deepEqual(missingRequired(d, false), ["Bottom"]);
  assert.equal(canSave(d, false), false);
  d = setSlot(d, "bottom", PANTS);
  assert.equal(canSave(d, false), true);   // no accessory needed
  assert.equal(filledCount(d), 3);
  const dress = setSlot(setSlot(emptyDraft(), "top", DRESS), "shoes", SHOE);
  assert.equal(canSave(dress, true), true);   // one-piece Top: Bottom stays empty
  assert.equal(canSave(dress, false), false);
});

test("saved outfit keeps ids and slot order only; round trip through storage", () => {
  let d = emptyDraft();
  d = setSlot(setSlot(setSlot(d, "top", TOP), { acc: 2 }, CAP), { acc: 0 }, CAP2);
  const s = toSaved(d, "x1");
  assert.deepEqual(s, { id: "x1", top: 1, bottom: null, shoes: null, acc: [7, 6] });
  const back = parseStore(serializeStore({ v: 1, outfits: [s] }));
  assert.deepEqual(back.outfits, [s]);
  assert.deepEqual(fromSaved(s).acc.filter((x) => x !== null), [7, 6]);
});

test("storage: broken or foreign data gives an empty store; bad entries are dropped", () => {
  assert.deepEqual(parseStore(null), emptyStore());
  assert.deepEqual(parseStore("{nope"), emptyStore());
  assert.deepEqual(parseStore(JSON.stringify({ v: 2, outfits: [] })), emptyStore());
  const p = parseStore(JSON.stringify({ v: 1, outfits: [{ id: "a", top: 1, acc: [2, 2, "x", -3] }, { id: "", top: 1 }, { id: "b" }, null] }));
  assert.deepEqual(p.outfits, [{ id: "a", top: 1, bottom: null, shoes: null, acc: [2] }]);
});

test("old data: outfits without required pieces stay; more accessories than slots are all kept and shown", () => {
  const many = Array.from({ length: MY_OUTFITS_ACC_SLOTS + 3 }, (_, i) => 100 + i);
  const old = { id: "old", top: null, bottom: null, shoes: null, acc: many };
  const store = parseStore(JSON.stringify({ v: 1, outfits: [old, { id: "o2", top: 1, bottom: null, shoes: null, acc: [] }] }));
  assert.equal(store.outfits.length, 2);
  assert.deepEqual(store.outfits[0].acc, many);   // nothing cut on load
  const d = fromSaved(store.outfits[0]);
  assert.equal(d.acc.length, many.length);        // extra ones sit beyond the layout slots (the editor lists them below)
  assert.equal(canSave(d, false), false);         // cannot be saved again until Top, Bottom, Shoes are filled
  const fixed = setSlot(setSlot(setSlot(d, "top", TOP), "bottom", PANTS), "shoes", SHOE);
  assert.equal(canSave(fixed, false), true);
  assert.deepEqual(toSaved(fixed, "old").acc, many);   // saving keeps every accessory
  assert.deepEqual(fromSaved({ id: "x", top: 1, bottom: 4, shoes: 5, acc: [6] }).acc.length, MY_OUTFITS_ACC_SLOTS);
});

test("max saved outfits; edit replaces, delete removes", () => {
  let s = emptyStore();
  for (let i = 0; i < MY_OUTFITS_MAX_SAVED; i++) s = saveOutfit(s, { id: `o${i}`, top: i + 1, bottom: null, shoes: null, acc: [] })!;
  assert.equal(s.outfits.length, 50);
  assert.equal(saveOutfit(s, { id: "new", top: 999, bottom: null, shoes: null, acc: [] }), null);
  const edited = saveOutfit(s, { id: "o3", top: 777, bottom: null, shoes: null, acc: [] })!;
  assert.equal(edited.outfits.length, 50);
  assert.equal(edited.outfits.find((o) => o.id === "o3")!.top, 777);
  assert.equal(deleteOutfit(s, "o3").outfits.length, 49);
});

test("unliked products stay in the outfit and show grey", () => {
  const liked = new Set([1, 6]);
  assert.equal(isGreyId(1, liked), false);
  assert.equal(isGreyId(5, liked), true);
  assert.equal(isGreyId(undefined, liked), true);
  liked.delete(1);
  assert.equal(isGreyId(1, liked), true);
  const s = toSaved(setSlot(emptyDraft(), "top", TOP), "k");
  assert.equal(s.top, 1);   // the saved outfit does not change when a product is unliked
});

test("an outfit with blank main slots still lays out (blank pieces keep their place)", async () => {
  const { computeLayout } = await import("../src/lib/layout/engine");
  const { garmentClass } = await import("../src/lib/layout/config");
  const { blankCard, isBlankId } = await import("../src/lib/my-outfits");
  for (const kind of ["three", "full"] as const) {
    const slots = kind === "full" ? (["full", "shoes"] as const) : (["top", "bottom", "shoes"] as const);
    const pieces = Object.fromEntries(slots.map((s) => [s, { slot: s, cls: garmentClass(s, blankCard(s === "full" ? "top" : s).name), aspect: null }]));
    const l = computeLayout({ kind, pieces, seed: 1, canvas: { w: 300, h: 500 }, accessories: [{ slot: "acc1", type: "cap", size: null, aspect: 1, placement: "side", zone: "head", frontFlat: false, beltShape: null }] });
    assert.ok(l.pieces.length >= slots.length);
  }
  assert.ok(isBlankId(blankCard("shoes").id) && !isBlankId(5));
});

test("editor layout: the accessory slots all fit at once (stacked and side-by-side), main slots at the normal positions", async () => {
  const { editorLayout, unplacedAcc } = await import("../src/lib/my-outfits-layout");
  const folded = { ...TOP, presentation: "folded" } as FeedCard;
  for (const [w, h] of [[320, 440], [360, 520], [390, 600], [416, 700]]) {
    for (const cards of [{}, { top: folded, bottom: PANTS, shoes: SHOE }]) {
      const l = editorLayout(cards, { w, h });
      assert.deepEqual(unplacedAcc(l, MY_OUTFITS_ACC_SLOTS), [], `${w}x${h} ${Object.keys(cards).length}`);
      for (const s of ["top", "bottom", "shoes"]) assert.ok(l.pieces.some((p) => p.slot === s), s);
      const rs = l.pieces.map((p) => p.rect);   // accessories never overlap anything (shoes over the hem is the layout's own rule)
      rs.forEach((a, i) => rs.forEach((b, j) => { if (i < j && (l.pieces[i].slot.startsWith("acc") || l.pieces[j].slot.startsWith("acc"))) assert.ok(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5, `overlap ${l.pieces[i].slot}/${l.pieces[j].slot}`); }));
    }
  }
  const full = editorLayout({ top: { ...DRESS } as FeedCard }, { w: 360, h: 520 });   // one-piece: full-body layout, no Bottom slot
  assert.ok(full.pieces.some((p) => p.slot === "full") && !full.pieces.some((p) => p.slot === "bottom"));
});

// ---- accessory frame / move / resize (pure logic) ----
import { accRect, applyAccLayout, clampCenter, clampScale, defaultAccLayout, isDrag, maxScaleFor, moveLayout, nextZ, parseAccLayout, resizeLayout } from "../src/lib/my-outfits-acc";
import { MY_OUTFITS_ACC_DRAG_PX, MY_OUTFITS_ACC_MAX_SCALE, MY_OUTFITS_ACC_MIN_SCALE } from "../src/config/my-outfits";

const W = 300, H = 600, DEF = { x: 220, y: 100, w: 60, h: 60 };

test("scale is clamped to the config min / max (and to what fits the area)", () => {
  assert.equal(clampScale(0.01, DEF, W, H), MY_OUTFITS_ACC_MIN_SCALE);
  assert.equal(clampScale(99, DEF, W, H), MY_OUTFITS_ACC_MAX_SCALE);
  assert.equal(clampScale(1.3, DEF, W, H), 1.3);
  assert.equal(clampScale(NaN, DEF, W, H), 1);
  assert.ok(maxScaleFor({ x: 10, y: 0, w: 60, h: 60 }, W, H) <= 70 / 60);   // little room to the left of the right edge
});

test("vertical position is clamped so the slot stays fully inside the area", () => {
  assert.equal(clampCenter(-1, 60, H), 30 / H);
  assert.equal(clampCenter(2, 60, H), 1 - 30 / H);
  assert.equal(clampCenter(0.5, 60, H), 0.5);
  const r = accRect(DEF, { y: 0, s: 1 }, W, H);
  assert.equal(r.y, 0);
  const r2 = accRect(DEF, { y: 1, s: 1 }, W, H);
  assert.equal(r2.y + r2.h, H);
  assert.equal(r2.x, DEF.x);   // horizontal position stays
});

test("move is vertical only and clamped to the whole area height", () => {
  const start = defaultAccLayout(DEF, H);
  const down = moveLayout(DEF, start, 50, W, H), r = accRect(DEF, down, W, H);
  assert.equal(r.y, DEF.y + 50); assert.equal(r.x, DEF.x);
  assert.equal(accRect(DEF, moveLayout(DEF, start, 9999, W, H), W, H).y + 60, H);
  assert.equal(accRect(DEF, moveLayout(DEF, start, -9999, W, H), W, H).y, 0);
});

test("resize keeps the aspect ratio and the top-right corner; stays inside the area", () => {
  const start = defaultAccLayout({ ...DEF, h: 90 }, H), def = { ...DEF, h: 90 };
  const big = accRect(def, resizeLayout(def, start, -30, 45, W, H), W, H);
  assert.ok(Math.abs(big.w / big.h - 60 / 90) < 1e-9);
  assert.ok(big.w > def.w);
  assert.equal(big.x + big.w, def.x + def.w);   // right edge fixed
  assert.ok(Math.abs(big.y - def.y) < 1e-6);    // top edge fixed
  const tiny = accRect(def, resizeLayout(def, start, 9999, -9999, W, H), W, H);
  assert.ok(Math.abs(tiny.w / def.w - MY_OUTFITS_ACC_MIN_SCALE) < 1e-9);
  const huge = accRect(def, resizeLayout(def, { y: 0.95, s: 1 }, -9999, 9999, W, H), W, H);
  assert.ok(huge.y >= 0 && huge.y + huge.h <= H + 1e-6 && huge.x >= -1e-6);
});

test("tap versus drag threshold", () => {
  assert.equal(isDrag(0, 0), false);
  assert.equal(isDrag(MY_OUTFITS_ACC_DRAG_PX, 0), false);
  assert.equal(isDrag(0, -(MY_OUTFITS_ACC_DRAG_PX + 1)), true);
  assert.equal(isDrag(5, 5), true);   // diagonal counts by distance
});

test("touched last is drawn on top", () => {
  assert.equal(nextZ([null, { y: 0.5, s: 1, z: 3 }, { y: 0.2, s: 1 }]), 4);
  assert.equal(nextZ([]), 1);
  const pieces = [{ slot: "top", rect: DEF, rot: 0, z: 1 }, { slot: "acc1", rect: DEF, rot: 0, z: 5 }, { slot: "acc2", rect: DEF, rot: 0, z: 6 }] as never;
  const out = applyAccLayout(pieces, [{ y: 0.5, s: 1, z: 1 }, { y: 0.5, s: 1, z: 2 }], W, H);
  assert.ok(out[2].z > out[1].z && out[1].z > 6);
  assert.equal(out[0], (pieces as { slot: string }[])[0]);   // main pieces untouched
  assert.equal(applyAccLayout(pieces, undefined, W, H), pieces);
});

test("stored layout: old data loads unchanged, new data round-trips, junk is dropped", () => {
  const old = JSON.stringify({ v: 1, outfits: [{ id: "a", top: 1, bottom: 2, shoes: 3, acc: [6, 7] }] });
  const s0 = parseStore(old);
  assert.deepEqual(s0.outfits[0], { id: "a", top: 1, bottom: 2, shoes: 3, acc: [6, 7] });   // no accL added
  assert.deepEqual(serializeStore(s0), JSON.stringify(s0));
  assert.equal(fromSaved(s0.outfits[0]).accL?.every((x) => x === null), true);

  let d = setSlot(setSlot(emptyDraft(), { acc: 1 }, CAP), { acc: 3 }, CAP2);
  d = { ...d, accL: [{ y: 0.9, s: 1 }, { y: 0.3, s: 1.4, z: 2 }, null, { y: 0.6, s: 0.8 }, null, null, null] };
  const saved = toSaved(d, "x");
  assert.deepEqual(saved.acc, [6, 7]);
  assert.deepEqual(saved.accL, [{ y: 0.3, s: 1.4, z: 2 }, { y: 0.6, s: 0.8 }]);   // empty slots are not saved, layouts follow their product
  const back = parseStore(serializeStore({ v: 1, outfits: [saved] })).outfits[0];
  assert.deepEqual(back, saved);
  assert.deepEqual(fromSaved(back).accL?.slice(0, 2), saved.accL);
  assert.equal(toSaved(setSlot(emptyDraft(), { acc: 0 }, CAP), "y").accL, undefined);   // nothing custom = no field

  const junk = parseStore(JSON.stringify({ v: 1, outfits: [{ id: "j", top: 1, bottom: null, shoes: null, acc: [6, 6, 7], accL: [{ y: 5, s: 99, z: 1.5 }, { y: 0.1, s: 1 }, "x"] }] })).outfits[0];
  assert.deepEqual(junk.acc, [6, 7]);
  assert.deepEqual(junk.accL, [{ y: 1, s: MY_OUTFITS_ACC_MAX_SCALE }, null]);   // clamped; the duplicate's layout is dropped with it; bad z / junk ignored
  assert.equal(parseAccLayout({ y: "a", s: 1 }), null);
});
