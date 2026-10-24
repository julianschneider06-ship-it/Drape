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
