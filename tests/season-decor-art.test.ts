import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DECOR_ART } from "../src/config/season-decor";
import { artLayerStyle, parseDecorMode } from "../src/lib/season-decor";

for (const [season, layers] of Object.entries(DECOR_ART)) {
  test(`${season} has layers with existing files and sane sizes`, () => {
    assert.ok(layers.length > 0);
    for (const l of layers) {
      assert.ok(existsSync(`public${l.src}`), l.src);
      assert.ok(l.widthPct != null || l.heightPct != null);
      assert.ok((l.widthPct ?? 0) <= 100 && (l.heightPct ?? 0) <= 100);
      assert.ok(l.opacity > 0 && l.opacity <= 1);
    }
  });
}
test("style per anchor", () => {
  assert.equal(artLayerStyle(DECOR_ART.autumn[0], true).left, "-6%");
  assert.ok(String(artLayerStyle(DECOR_ART.winter[0], true).top).includes("safe-area-inset-top"));
});
test("?decor parameter: pixel only on 'pixel'", () => {
  assert.equal(parseDecorMode("pixel"), "pixel");
  assert.equal(parseDecorMode("art"), "art");
  assert.equal(parseDecorMode(null), "art");
  assert.equal(parseDecorMode("x"), "art");
});
