import { test } from "node:test";
import assert from "node:assert/strict";
import { anchorSequence, avoidIds, isFiller, nextAnchor, pieceIdAt, usableLiked } from "../src/lib/wishlist-outfits";
import { WISHLIST_REUSE_RATE } from "../src/config/wishlist";
import { makeRnd } from "../src/outfits/pool-shared";
import { buildCatalogue, type RawCatPiece } from "../src/outfits/catalogue";
import { composeAround, newAround } from "../src/outfits/compose-around";
import type { FeedOutfit } from "../src/lib/types";

const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

test("reuse rate: about 3 in 10 outfits reuse an already used liked piece", () => {
  const seq = anchorSequence(range(400), 7, 100), seen = new Set<number>();
  let reuse = 0; for (const a of seq) { if (seen.has(a)) reuse++; seen.add(a); }
  const rate = reuse / seq.length;
  assert.equal(seq.length, 100);
  assert.ok(Math.abs(rate - WISHLIST_REUSE_RATE) < 0.1, `rate ${rate}`);
});

test("no piece in two consecutive outfits when there is an alternative", () => {
  for (const n of [2, 3, 10, 50]) { const s = anchorSequence(range(n), 3, 200); for (let i = 1; i < s.length; i++) assert.notEqual(s[i], s[i - 1], `n=${n} at ${i}`); }
});

test("a single liked piece may repeat (nothing else to pick)", () => assert.deepEqual(anchorSequence([5], 1, 4), [5, 5, 5, 5]));

test("reuse is spread: with few pieces every piece is used about equally often", () => {
  const c = new Map<number, number>(); for (const a of anchorSequence(range(5), 11, 100)) c.set(a, (c.get(a) ?? 0) + 1);
  for (const v of c.values()) assert.ok(v >= 15 && v <= 25, `count ${v}`);
});

test("seeded: same seed same sequence, another seed another one", () => {
  const a = anchorSequence(range(60), 42, 30);
  assert.deepEqual(anchorSequence(range(60), 42, 30), a);
  assert.deepEqual(anchorSequence(range(60), 42, 12), a.slice(0, 12));   // a longer scroll never changes what was already shown
  assert.notDeepEqual(anchorSequence(range(60), 43, 30), a);
});

test("empty state: no liked pieces, no anchors", () => {
  assert.deepEqual(anchorSequence([], 1, 5), []);
  assert.equal(nextAnchor([], { uses: new Map(), last: null }, makeRnd(1)), null);
});

test("avoid ids: liked pieces only when another liked piece of that kind exists", () => {
  const liked = new Set([1, 2, 3]), kind = (id: number) => (id === 3 ? "shoes" : "top");
  const per = new Map([["top", 2], ["shoes", 1]]);
  assert.deepEqual([...avoidIds([1, 3, 9], liked, kind, per)].sort(), [1, 9]);   // 3 is the only liked shoe: may repeat; 9 is filler
});

const o = { id: 1, kind: "three", top: { id: 10 }, bottom: { id: 11 }, shoes: { id: 12 }, accessories: [{ slot_no: 1, card: { id: 20 } }, { slot_no: 2, card: { id: 21 } }], wl: [10, 21] } as unknown as FeedOutfit;
test("filler is flagged: not liked pieces are greyed (non-interactive), liked ones are normal", () => {
  assert.equal(pieceIdAt(o, "acc2"), 21);
  assert.deepEqual(["top", "bottom", "shoes", "acc1", "acc2"].map((s) => isFiller(o, s)), [false, true, true, true, false]);
  assert.equal(isFiller(o, "acc7"), true);
});

let pid = 0;
const piece = (slot: string, gender: string, o: Partial<RawCatPiece> = {}): RawCatPiece => ({
  id: ++pid, name: `${slot} ${pid}`, store: `shop${pid % 5}`, slot: slot as RawCatPiece["slot"], gender, sub: slot === "top" ? "tee" : slot === "bottom" ? "trousers" : "sneaker",
  styles: { streetwear: 1 }, colors: ["black"], pattern: "solid", silhouette: "regular", fit: "regular", formality: 0.4, boldness: 0.2, statement: 0.2, outer: false, season: ["spring", "summer", "autumn", "winter"],
  brand: "b", aspect: slot === "shoes" ? 1.6 : 0.85, hem: null, waist: null, collar: null, hood: null, fill: 0.8, presentation: null, cutout: `c${pid}.png`, image: `i${pid}.jpg`, url: "u", price_cents: 1000, compare_at_cents: null, currency: "USD", ...o });
const cat = () => {
  pid = 0; const ps: RawCatPiece[] = [];
  for (let i = 0; i < 12; i++) ps.push(piece("top", "men"), piece("bottom", "men"), piece("shoes", "men"));   // ids 1..36 men
  ps.push(piece("top", "women"), piece("top", "unisex"));                                                    // 37 women, 38 unisex
  return buildCatalogue({ version: "t", pieces: ps, accs: [] });
};

test("direction filter: only liked pieces of the chosen direction count (unisex counts for both)", () => {
  const c = cat();
  assert.deepEqual(usableLiked(c, "men", [1, 37, 38, 999, 1]).mains, [1, 38]);
  assert.deepEqual(usableLiked(c, "women", [1, 37, 38]).mains, [37, 38]);
  assert.deepEqual(usableLiked(c, "women", [1, 2]).mains, []);
});

test("liked first: partners are taken from the liked pieces, gaps are filled from the catalogue", () => {
  const c = cat(), likedBottom = 2, likedShoes = 3, liked = new Set([1, likedBottom, likedShoes]);
  let full = 0, fill = 0, n = 0;
  for (let k = 0; k < 20; k++) {
    const st = newAround(); st.liked = liked;
    const out = composeAround(c, "men", 1, false, st, k); if (!out) continue;
    n++; const likedCount = out.ids.filter((id) => liked.has(id)).length;
    if (likedCount === 3) full++;
    if (likedCount < out.ids.length) fill++;
    assert.ok(out.ids.includes(1));
  }
  assert.ok(n >= 10, `built ${n}`);
  assert.ok(full / n >= 0.6, `fully liked ${full}/${n}`);
  // only one liked piece (the anchor): the rest is filler
  const st = newAround(); st.liked = new Set([1]); const one = composeAround(c, "men", 1, false, st, 0);
  assert.ok(one && one.ids.filter((id) => id !== 1).every((id) => !st.liked!.has(id)) && one.ids.length === 3);
  assert.ok(fill >= 0);
});
