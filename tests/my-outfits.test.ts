import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addAccSlot, bottomLocked, canRemoveAcc, canSave, deleteOutfit, emptyDraft, emptyStore, filledCount, fitsSlot, fromSaved, isGreyId, parseStore, pickerItems, removeAccSlot, saveOutfit, serializeStore, setSlot, toSaved,
} from "../src/lib/my-outfits";
import { MY_OUTFITS_MAX_ACCESSORY_SLOTS, MY_OUTFITS_MAX_SAVED } from "../src/config/my-outfits";
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

test("starts with one accessory slot; add up to the max; only an empty extra slot can be removed", () => {
  let d = emptyDraft();
  assert.equal(d.acc.length, 1);
  for (let i = 0; i < 20; i++) d = addAccSlot(d);
  assert.equal(d.acc.length, MY_OUTFITS_MAX_ACCESSORY_SLOTS);
  assert.equal(MY_OUTFITS_MAX_ACCESSORY_SLOTS, 8);
  d = setSlot(d, { acc: 1 }, CAP);
  assert.equal(canRemoveAcc(d, 1), false);   // filled
  assert.equal(canRemoveAcc(d, 2), true);
  assert.equal(removeAccSlot(d, 2).acc.length, 7);
  assert.equal(removeAccSlot(d, 1).acc.length, 8);
  assert.equal(canRemoveAcc(emptyDraft(), 0), false);   // the only slot stays
});

test("the same product cannot sit twice; two different caps are fine", () => {
  let d = addAccSlot(emptyDraft());
  d = setSlot(d, { acc: 0 }, CAP);
  assert.deepEqual(setSlot(d, { acc: 1 }, CAP), d);
  d = setSlot(d, { acc: 1 }, CAP2);
  assert.deepEqual(d.acc, [6, 7]);
  assert.deepEqual(setSlot(d, { acc: 0 }, CAP).acc, [6, 7]);   // re-picking the own piece keeps it
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

test("save needs at least one filled slot", () => {
  let d = emptyDraft();
  assert.equal(canSave(d), false);
  d = setSlot(d, "shoes", SHOE);
  assert.equal(canSave(d), true);
  assert.equal(filledCount(d), 1);
});

test("saved outfit keeps ids and slot order only; round trip through storage", () => {
  let d = addAccSlot(addAccSlot(emptyDraft()));
  d = setSlot(setSlot(setSlot(d, "top", TOP), { acc: 2 }, CAP), { acc: 0 }, CAP2);
  const s = toSaved(d, "x1");
  assert.deepEqual(s, { id: "x1", top: 1, bottom: null, shoes: null, acc: [7, 6] });
  const back = parseStore(serializeStore({ v: 1, outfits: [s] }));
  assert.deepEqual(back.outfits, [s]);
  assert.deepEqual(fromSaved(s).acc, [7, 6]);
});

test("storage: broken or foreign data gives an empty store; bad entries are dropped", () => {
  assert.deepEqual(parseStore(null), emptyStore());
  assert.deepEqual(parseStore("{nope"), emptyStore());
  assert.deepEqual(parseStore(JSON.stringify({ v: 2, outfits: [] })), emptyStore());
  const p = parseStore(JSON.stringify({ v: 1, outfits: [{ id: "a", top: 1, acc: [2, 2, "x", -3] }, { id: "", top: 1 }, { id: "b" }, null] }));
  assert.deepEqual(p.outfits, [{ id: "a", top: 1, bottom: null, shoes: null, acc: [2] }]);
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
