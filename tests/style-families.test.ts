// Style families (display only): every detailed style belongs to exactly one family.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STYLE_KEYS } from "../src/classify/styles";
import { FAMILY_KEYS, STYLE_FAMILIES, familyOf } from "../src/config/style-families";
import { outfitIcons } from "../src/lib/outfit-icons";
import type { OutfitTags } from "../src/outfits/tags";

test("every style maps to exactly one family, and no family lists an unknown style", () => {
  const all = FAMILY_KEYS.flatMap((f) => [...STYLE_FAMILIES[f]] as string[]);
  assert.equal(all.length, new Set(all).size, "a style is listed twice");
  assert.deepEqual([...all].sort(), [...STYLE_KEYS].sort());
  for (const s of STYLE_KEYS) assert.ok(familyOf(s), s);
  assert.equal(familyOf("nope"), null);
  assert.equal(FAMILY_KEYS.length, 5);
});

const tags = (o: Partial<OutfitTags>): OutfitTags => ({ season_primary: "summer", season_fit: 1, style_primary: "skater", style_secondary: null, style_strength: 0.5, style_distinct: "skater", formality_level: "casual", weather: "warm", rain: false, occasion: "everyday",
  palette: { dominant: "black", accent: null, kind: "neutral" }, boldness: "calm", silhouette: "regular", contrast: false, contrast_type: null, has_outer_layer: false, sale_count: 0, ...o });

test("icons: family, season, then at most 3 notable extras; generic values give none", () => {
  assert.deepEqual(outfitIcons(tags({})), ["family-street", "season-summer"]);
  assert.deepEqual(outfitIcons(tags({ season_primary: "all" })), ["family-street"]);
  assert.deepEqual(outfitIcons(tags({ rain: true, occasion: "evening", boldness: "bold", contrast: true })), ["family-street", "season-summer", "rain", "evening", "contrast"]);
  assert.equal(outfitIcons(tags({ rain: true, occasion: "office", contrast: true, boldness: "bold", palette: { dominant: "red", accent: null, kind: "tonal" } })).length, 5);
  assert.deepEqual(outfitIcons(null), []);
});
