import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECOR_ART, DECOR_OVERSCAN_PX, LAYER_Z, STAGE_SOURCES } from "../src/config/season-decor";
import { computeDecorRect, stageFromRects, type DecorSeason } from "../src/lib/season-decor";

const src = (f: string) => readFileSync(f, "utf8");
const SEASONS: DecorSeason[] = ["spring", "summer", "autumn", "winter"];

test("stage = header bottom edge .. tab bar top edge, full width (same function for For You and Wishlist)", () => {
  assert.deepEqual(stageFromRects({ bottom: 120 }, { top: 780 }, 390, 844), { x: 0, y: 120, w: 390, h: 660 });
  assert.deepEqual(stageFromRects(null, null, 390, 844), { x: 0, y: 0, w: 390, h: 844 });   // nothing measured: whole viewport
  assert.equal(stageFromRects({ bottom: 900 }, { top: 800 }, 390, 844).h, 0);               // never negative
});
test("wishlist stage uses the Wishlist header block and the shared tab bar, For You keeps its header", () => {
  assert.equal(STAGE_SOURCES.wishlist.bottom, STAGE_SOURCES.feed.bottom);
  assert.notEqual(STAGE_SOURCES.wishlist.top, STAGE_SOURCES.feed.top);
  assert.match(src("src/components/WishlistView.tsx"), /data-stage-wishlist-top/);   // title row + switch
  assert.match(src("src/components/BottomNav.tsx"), /data-stage-bottom/);
});
test("every season's art stays inside the stage (+ overscan) at the Wishlist stage sizes", () => {
  for (const [w, h] of [[390, 650], [430, 760]]) {
    const stage = { x: 0, y: 140, w, h };   // y offset: below the header block
    for (const s of SEASONS) for (const l of DECOR_ART[s]) {
      const r = computeDecorRect(l, stage)!;
      assert.ok(r.w > 0 && r.h > 0, `${s} ${l.src} has size`);
      assert.ok(r.y >= stage.y - DECOR_OVERSCAN_PX - 0.5, `${s} ${l.src} not above the header edge`);
      assert.ok(r.y + r.h <= stage.y + h + DECOR_OVERSCAN_PX + 0.5, `${s} ${l.src} not under the tab bar`);
    }
  }
});
test("layer order holds in the Wishlist views: stripe < decor < figure < products < header / tab bar", () => {
  assert.ok(LAYER_Z.stripe < LAYER_Z.decor && LAYER_Z.decor < LAYER_Z.figure && LAYER_Z.figure < LAYER_Z.products && LAYER_Z.products < LAYER_Z.chrome);
  const back = src("src/components/WishlistBackdrop.tsx");
  assert.match(back, /zIndex: LAYER_Z\.stripe/);
  assert.match(back, /stageSource="wishlist"/);
  for (const f of ["src/components/GenerateOutfits.tsx", "src/components/MyOutfits.tsx"]) assert.match(src(f), /zIndex: LAYER_Z\.products/, `${f} scroller above decoration`);
  assert.match(src("src/components/WishlistView.tsx"), /zIndex: LAYER_Z\.chrome/);   // header above everything
});
test("precedence: Stripe Colorful / Simple replaces the Drape Background image, Stripe Off keeps it", () => {
  const back = src("src/components/WishlistBackdrop.tsx");
  assert.match(back, /stripeMode === "off" \? \(pictures && picOn \? null : <WishlistBackground \/>\) : <StripeBackground/);
  assert.doesNotMatch(src("src/components/GenerateOutfits.tsx"), /<WishlistBackground/);
});
