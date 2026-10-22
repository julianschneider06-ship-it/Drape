// Slot limits for women's accessories (WOMEN_ACC): max 1 sunglasses / head item / bag, max 3 jewelry (never two of one sub-type), max 1 belt, min 3 where supply allows, men unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STYLE_KEYS } from "../src/classify/styles";
import { WOMEN_ACC, chooseAccessories, isJewelry, singleKind, type Acc, type OutfitCtx, type Usage } from "../src/outfits/accessories";

const vec = (() => { const v = new Float32Array(STYLE_KEYS.length); v[0] = 1; return v; })();
let nextId = 1;
const acc = (type: string, over: Partial<Acc> = {}): Acc => ({ id: nextId++, store: `s${nextId % 7}`, type, genders: ["women", "men"], vec, main: "black", accent: null, mask: 15, formality: 0.4, statement: 0.2, bold: 0.2, frontFlat: false, beltShape: null, ...over });
const TYPES = ["sunglasses", "cap", "hat", "beanie", "bag", "backpack", "earrings", "necklace", "bracelet", "ring", "other_wearable", "watch", "belt", "scarf", "gloves"];
const pool = (n = 40) => TYPES.flatMap((t) => Array.from({ length: n }, () => acc(t)));
const ctx = (over: Partial<OutfitCtx> = {}): OutfitCtx => ({ gender: "women", vec, mask: 15, formality: 0.4, accents: new Set(), statements: 0, warm: false, cold: false, tailored: false, hasBottom: true, full: false, outerTop: false, maxN: 3, ...over });
const usage = (): Usage => ({ uses: new Map(), recentIds: [], recentStores: [] });
const count = (types: string[], f: (t: string) => boolean) => types.filter(f).length;

test("women: slot limits hold over many outfits", () => {
  const cands = pool(); const u = usage();
  for (let i = 0; i < 200; i++) {
    const picks = chooseAccessories(ctx({ warm: i % 3 === 0, formality: 0.2 + (i % 6) * 0.1 }), cands, u);
    for (const p of picks) u.uses.set(p.acc.id, (u.uses.get(p.acc.id) ?? 0) + 1);
    const t = picks.map((p) => p.acc.type);
    assert.ok(t.length >= WOMEN_ACC.minTotal && t.length <= WOMEN_ACC.maxTotal, `total ${t.length}`);
    assert.ok(count(t, (x) => x === "sunglasses") <= 1);
    assert.ok(count(t, (x) => singleKind(x) === "head") <= 1);
    assert.ok(count(t, (x) => singleKind(x) === "bag") <= 1);
    assert.ok(count(t, isJewelry) <= WOMEN_ACC.jewelry.max);
    assert.ok(count(t, (x) => x === "belt") <= 1);
    for (const ty of Object.keys(WOMEN_ACC.jewelry.perType)) assert.ok(count(t, (x) => x === ty) <= WOMEN_ACC.jewelry.perType[ty], `two ${ty}`);
    assert.ok(new Set(t).size === t.length, "no duplicate type");
  }
});

test("women: with plenty of supply most outfits get 2+ singles and jewelry", () => {
  const cands = pool(); let singles2 = 0, jew1 = 0; const u = usage();
  for (let i = 0; i < 100; i++) {
    const t = chooseAccessories(ctx(), cands, u).map((p) => p.acc.type);
    if (count(t, (x) => !!singleKind(x)) >= WOMEN_ACC.minSingles) singles2++; if (count(t, isJewelry) >= 1) jew1++;
  }
  assert.ok(singles2 >= 90 && jew1 >= 90, `singles2 ${singles2}, jewelry ${jew1}`);
});

test("women: no sunglasses in a cold outfit, no head item or backpack in a tailored one, nothing forced", () => {
  const cands = pool();
  for (let i = 0; i < 30; i++) {
    assert.ok(!chooseAccessories(ctx({ cold: true }), cands, usage()).some((p) => p.acc.type === "sunglasses"));
    const tt = chooseAccessories(ctx({ tailored: true, formality: 0.8 }), pool(), usage()).map((p) => p.acc.type);
    assert.ok(!tt.some((x) => singleKind(x) === "head" || x === "backpack"));
  }
});

test("women: thin supply is not padded (fewer than 3 stays fewer than 3)", () => {
  const picks = chooseAccessories(ctx(), [acc("bag"), acc("earrings")], usage());
  assert.ok(picks.length <= 2);
});

test("men are unchanged: at most 3, old rules", () => {
  for (let i = 0; i < 50; i++) assert.ok(chooseAccessories(ctx({ gender: "men" }), pool(), usage()).length <= 3);
});
