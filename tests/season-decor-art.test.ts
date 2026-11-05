import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DECOR_ART, DECOR_OVERSCAN_PX, LAYER_Z } from "../src/config/season-decor";
import { artClip, artLayerStyle, parseDecorMode } from "../src/lib/season-decor";

const W = 390, H = 844, num = (v: unknown) => Number(v);
function webpSize(file: string): [number, number] {   // minimal header parse (VP8X / VP8L / VP8)
  const b = readFileSync(file), t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === "VP8L") { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}
for (const [season, layers] of Object.entries(DECOR_ART)) {
  test(`${season} has layers with existing files, true aspect and sane sizes`, () => {
    assert.ok(layers.length > 0);
    for (const l of layers) {
      assert.ok(existsSync(`public${l.src}`), l.src);
      const [w, h] = webpSize(`public${l.src}`);
      assert.ok(Math.abs(l.aspect / (w / h) - 1) < 0.01, `${l.src} aspect ${l.aspect} vs file ${w / h}`);
      assert.ok(l.widthMode === "screen" || l.widthPct != null || l.heightPct != null);
      assert.ok((l.widthPct ?? 0) <= 100 && (l.heightPct ?? 0) <= 100);
      assert.ok(l.opacity > 0 && l.opacity <= 1);
      if (!l.stretch) assert.ok(!(l.widthPct != null && l.heightPct != null) && l.widthMode !== "screen", "no stretching without stretch: true");
      if (l.stretch) assert.ok((l.maxStretch ?? 0) > 0 && (l.maxStretch ?? 0) <= 0.4);
    }
  });
}
test("border sprites are flush with the real screen edges (offset 0, overscan, no env/safe area)", () => {
  const edges: Record<string, string[]> = { spring_meadow: ["bottom", "left", "right"], summer_wave: ["bottom", "left", "right"], winter_clouds: ["top", "left", "right"], autumn_tree: ["bottom", "left"] };
  for (const l of Object.values(DECOR_ART).flat()) {
    const name = l.src.split("/").pop()!.replace(".webp", ""), st = artLayerStyle(l, W, H)!;
    assert.ok(!JSON.stringify(st).includes("env("));
    for (const side of edges[name] ?? []) {
      assert.ok((l.flush ?? []).includes(side as never), `${name} flush ${side}`);
      if (side === "right" && l.anchor === "bottom") continue;   // full-width layers: left + width cover the right edge, checked below
      if (st[side] != null) assert.equal(num(st[side]), -DECOR_OVERSCAN_PX, `${name} ${side}`);
    }
    if (l.widthMode === "screen") { assert.equal(num(st.left), -DECOR_OVERSCAN_PX); assert.ok(num(st.left) + num(st.width) >= W + DECOR_OVERSCAN_PX); }
  }
});
test("stretch stays within the limits for phones and wide screens", () => {
  for (const [w, h] of [[390, 844], [360, 640], [430, 932], [820, 1180], [1280, 800]]) for (const l of Object.values(DECOR_ART).flat().filter((x) => x.stretch)) {
    const st = artLayerStyle(l, w, h)!, r = num(st.width) / num(st.height) / l.aspect;
    assert.ok(r >= 1 - l.maxStretch! - 1e-9 && r <= 1 + l.maxStretch! + 1e-9, `${l.src} ${w}x${h} ratio ${r}`);
  }
  const tree = artLayerStyle(DECOR_ART.autumn[0], W, H)!;   // not stretched: aspect kept
  assert.ok(Math.abs(num(tree.width) / num(tree.height) / DECOR_ART.autumn[0].aspect - 1) < 1e-9);
  assert.equal(num(tree.height), H * 0.6);
});
test("sun: top-right, about 30 % wide, fully inside the screen, clear of the icon row", () => {
  const l = DECOR_ART.summer[0], st = artLayerStyle(l, W, H)!;
  assert.equal(l.anchor, "top-right");
  assert.ok(num(st.width) / W >= 0.28 && num(st.width) / W <= 0.32);
  assert.ok(num(st.top) / H >= 0.08 && num(st.top) / H <= 0.1);
  assert.ok(num(st.right) >= 0 && W - num(st.right) - num(st.width) > W * 0.5);   // inside the screen, right half
});
test("art clip: nothing cut at rest, only the border to a neighbour moves", () => {
  assert.deepEqual(artClip(3, 3 * 800, 800, 50, 900), { top: 0, bottom: 0 });
  assert.equal(artClip(2, 3 * 800, 800, 50, 900), null);
  assert.deepEqual(artClip(3, 3 * 800 + 200, 800, 50, 900), { top: 0, bottom: 900 - (50 + 600) });   // swiping to the next: this outfit's bottom edge rises
  assert.deepEqual(artClip(4, 3 * 800 + 200, 800, 50, 900), { top: 50 + 600, bottom: 0 });
});
test("?decor parameter: pixel only on 'pixel'", () => {
  assert.equal(parseDecorMode("pixel"), "pixel");
  assert.equal(parseDecorMode("art"), "art");
  assert.equal(parseDecorMode(null), "art");
  assert.equal(parseDecorMode("x"), "art");
});
test("layer order: stripe < decoration < figure < products < header/tab bar", () => {
  assert.ok(LAYER_Z.stripe < LAYER_Z.decor);
  assert.ok(LAYER_Z.decor < LAYER_Z.figure);
  assert.ok(LAYER_Z.figure < LAYER_Z.products);
  assert.ok(LAYER_Z.products < LAYER_Z.chrome);
});
