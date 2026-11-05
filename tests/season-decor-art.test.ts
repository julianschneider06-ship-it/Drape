import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DECOR_ART, LAYER_Z } from "../src/config/season-decor";
import { artClip, artLayerStyle, parseDecorMode } from "../src/lib/season-decor";

for (const [season, layers] of Object.entries(DECOR_ART)) {
  test(`${season} has layers with existing files and sane sizes`, () => {
    assert.ok(layers.length > 0);
    for (const l of layers) {
      assert.ok(existsSync(`public${l.src}`), l.src);
      assert.ok(l.widthPct != null || l.heightPct != null);
      assert.ok((l.widthPct ?? 0) <= 100 && (l.heightPct ?? 0) <= 100);   // screen-relative: never larger than the screen in its sized dimension
      assert.ok(Math.abs(l.offsetXPct) <= 20 && Math.abs(l.offsetYPct) <= 30, "offsets stay sensible");
      assert.ok(!(l.widthPct != null && l.heightPct != null), "one size dimension only (no stretching)");
      assert.ok(l.opacity > 0 && l.opacity <= 1);
    }
  });
}
test("style per anchor: screen edges, no safe-area inset", () => {
  const t = artLayerStyle(DECOR_ART.autumn[0]);
  assert.equal(t.left, `${DECOR_ART.autumn[0].offsetXPct}%`);
  assert.equal(t.bottom, "0%");
  for (const layers of Object.values(DECOR_ART)) for (const l of layers) assert.ok(!JSON.stringify(artLayerStyle(l)).includes("env("));
  assert.equal(artLayerStyle(DECOR_ART.winter[0]).top, `${DECOR_ART.winter[0].offsetYPct}%`);
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
