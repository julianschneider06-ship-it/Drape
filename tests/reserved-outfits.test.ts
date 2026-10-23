// Reserved outfits for thin styles: style-weight rule (>= 2 pieces), per-piece cap, idempotence, existing labels untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRnd } from "../src/outfits/pool-shared";
import { outfitStyle, toPiece, type Piece, type RawPiece, type Slot } from "../src/outfits/score";
import { carriesStyle, RESERVED, reservedFor, thinStyles } from "../src/outfits/reserved";

let n = 1;
const raws = new Map<number, RawPiece>();
function mk(slot: Slot, styles: Record<string, number>, over: Partial<RawPiece> = {}): Piece {
  const r: RawPiece = { id: n++, store: `s${n % 9}`, slot, gender: "men", sub: "x", styles, colors: ["black"], pattern: "solid", silhouette: "regular", fit: "regular",
    formality: 0.3, boldness: 0.2, statement: 0.2, outer: false, season: ["spring", "summer", "autumn", "winter"], ...over };
  raws.set(r.id, r);
  return toPiece(r)!;
}
// street dominates every vector, grunge is a secondary weight on some pieces (the real situation)
const street = { streetwear: 1 };
const withG = (g: number) => ({ streetwear: 1, grunge: g });
const pieces: Piece[] = [];
for (let i = 0; i < 40; i++) pieces.push(mk("top", i < 25 ? withG(0.6) : street), mk("bottom", i < 20 ? withG(0.5) : street), mk("shoes", i < 8 ? withG(0.45) : street));
const w = (p: Piece) => raws.get(p.id)?.styles?.grunge ?? 0;

const run = (seed = 7, taken = new Set<string>()) => reservedFor(pieces, "men", "grunge", w, makeRnd(seed), 0.5, taken);

test("every reserved outfit has an anchor >= 0.5 and at least 2 pieces >= 0.4", () => {
  const out = run();
  assert.ok(out.length > 0 && out.length <= RESERVED.perStyle);
  for (const c of out) {
    assert.ok(c.pieces.filter((p) => w(p) >= RESERVED.partnerMin).length >= RESERVED.minPieces);
    assert.ok(c.pieces.some((p) => w(p) >= RESERVED.anchorMin));
    assert.equal(c.style, "grunge");
  }
  assert.ok(!carriesStyle([pieces[0], pieces[1]], pieces[0], () => 0.3));
  assert.ok(!carriesStyle([pieces[0], pieces[1]], pieces[0], (p) => (p === pieces[0] ? 0.9 : 0.1)), "one styled piece is not enough");
});

test("a piece is in at most 4 reserved outfits of the style, no near-duplicates", () => {
  const out = run(); const uses = new Map<number, number>();
  for (const c of out) for (const id of c.ids) uses.set(id, (uses.get(id) ?? 0) + 1);
  assert.ok(Math.max(...uses.values()) <= RESERVED.pieceCap);
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert.ok(out[i].ids.filter((id) => out[j].ids.includes(id)).length <= RESERVED.maxShared);
});

test("idempotent: same input gives the same outfits, nothing already taken is repeated", () => {
  const a = run(), b = run();
  assert.deepEqual(a.map((c) => c.key), b.map((c) => c.key));
  assert.equal(new Set(a.map((c) => c.key)).size, a.length);
  const again = run(7, new Set(a.map((c) => c.key)));
  assert.ok(again.every((c) => !a.some((x) => x.key === c.key)));
});

test("existing labels are not changed: outfitStyle still says streetwear, only the reserved copy carries the new label", () => {
  const out = run();
  assert.ok(out.length > 0);
  for (const c of out) assert.equal(outfitStyle(c.pieces), "streetwear");
});

test("too few good outfits = none; thin styles come from the counts", () => {
  const few = pieces.slice(0, 6);
  assert.equal(reservedFor(few, "men", "grunge", w, makeRnd(1), 0.5, new Set()).length, 0);
  assert.deepEqual(thinStyles({ a: 200, b: 149, c: 0 }, ["a", "b", "c", "d"]), ["b", "c", "d"]);
});
