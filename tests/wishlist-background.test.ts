import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { WISHLIST_BG } from "../src/config/wishlist-background";

test("wishlist background config points to a real asset with a valid overlay", () => {
  assert.ok(WISHLIST_BG.src.startsWith("/backgrounds/"));
  assert.ok(existsSync(`public${WISHLIST_BG.src}`));
  assert.ok(WISHLIST_BG.overlayOpacity >= 0 && WISHLIST_BG.overlayOpacity <= 1);
});
