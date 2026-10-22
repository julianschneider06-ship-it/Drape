import { test } from "node:test";
import assert from "node:assert/strict";
import { heartLook, heartVisual, refreshItems } from "../src/lib/wishlist-soft";
import { WISHLIST_HEART } from "../src/config/wishlist";

const items = [{ id: 1 }, { id: 2 }, { id: 3 }];

test("soft unlike: an unliked product stays in the list with a white heart", () => {
  const liked = new Set([1, 2, 3]);
  liked.delete(2);   // tap the heart
  assert.equal(items.length, 3);   // the list is not touched while staying on the tab
  assert.equal(heartLook(2, liked), "white");
  assert.equal(heartLook(1, liked), "black");
  assert.equal(heartVisual("white", WISHLIST_HEART).fill, WISHLIST_HEART.off.fill);
  assert.ok(heartVisual("white", WISHLIST_HEART).filter);
});

test("re-like restores the black heart, toggling back and forth is stable", () => {
  const liked = new Set([1, 3]);
  for (let i = 0; i < 4; i++) { if (liked.has(2)) liked.delete(2); else liked.add(2); }
  assert.equal(heartLook(2, liked), "white");
  liked.add(2);
  assert.equal(heartLook(2, liked), "black");
  assert.equal(heartVisual("black", WISHLIST_HEART).fill, WISHLIST_HEART.on.fill);
});

test("re-entry refreshes: products that are no longer liked drop out", () => {
  assert.deepEqual(refreshItems(items, new Set([1, 3])).map((c) => c.id), [1, 3]);
  assert.deepEqual(refreshItems(items, new Set([1, 2, 3])).map((c) => c.id), [1, 2, 3]);
});
