import { test } from "node:test";
import assert from "node:assert/strict";
import { fromSaved, parseStore, setSlot, toSaved, type SavedOutfit } from "../src/lib/my-outfits";
import { accSlotMode, activeAccLayouts, applyAccLayout, type AccLayout } from "../src/lib/my-outfits-acc";
import type { Placed } from "../src/lib/layout/engine";
import type { FeedCard } from "../src/lib/types";

const card = (id: number, slot: string) => ({ id, slot, brand: "b", name: "n" }) as FeedCard;
const CAP = card(6, "accessory"), CAP2 = card(7, "accessory");
const DEF = { x: 100, y: 200, w: 50, h: 60 };   // default rect of acc1 in a 400 x 800 area
const pieces = [{ slot: "acc1", rect: DEF, z: 3, rot: 0 }] as unknown as Placed[];
const STORED: AccLayout = { y: 0.2, s: 1.5, z: 2 };
const saved: SavedOutfit = { id: "o1", top: 1, bottom: 4, shoes: 5, acc: [6], accL: [STORED] };

test("switch off: no stored layout is applied, the pieces keep the default layout (no gestures either)", () => {
  assert.equal(accSlotMode(false), "plain");
  assert.equal(activeAccLayouts(false, [STORED]), undefined);
  const out = applyAccLayout(pieces, activeAccLayouts(false, [STORED]), 400, 800);
  assert.deepEqual(out[0].rect, DEF);
  assert.equal(out[0].z, 3);
});

test("switch on: the stored layout applies as in Prompt 61 (moved, resized, on top)", () => {
  assert.equal(accSlotMode(true), "custom");
  assert.deepEqual(activeAccLayouts(true, [STORED]), [STORED]);
  const out = applyAccLayout(pieces, activeAccLayouts(true, [STORED]), 400, 800);
  assert.notDeepEqual(out[0].rect, DEF);
  assert.equal(out[0].rect.w, DEF.w * 1.5);
  assert.ok(out[0].z > 3);
});

test("stored layout survives a save while the switch is off (edit a main piece and an accessory, then save)", () => {
  const store = parseStore(JSON.stringify({ v: 1, outfits: [saved] }));
  const draft = fromSaved(store.outfits[0]);
  const edited = setSlot(setSlot(draft, { acc: 1 }, CAP2), "shoes", card(5, "shoes"));   // add a second accessory while off
  const out = toSaved(edited, "o1");
  assert.deepEqual(out.accL?.[0], STORED);
  assert.deepEqual(out.acc, [6, 7]);
});

test("saving untouched while off writes the same layout data back", () => {
  const out = toSaved(fromSaved(parseStore(JSON.stringify({ v: 1, outfits: [saved] })).outfits[0]), "o1");
  assert.deepEqual(out.accL, [STORED]);
});

test("layout stored with the switch off comes back when it is switched on again", () => {
  const off = toSaved(setSlot(fromSaved(saved), "top", card(2, "top")), "o1");
  const again = applyAccLayout(pieces, activeAccLayouts(true, off.accL), 400, 800);
  assert.notDeepEqual(again[0].rect, DEF);
});
