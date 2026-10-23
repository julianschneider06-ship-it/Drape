import { test } from "node:test";
import assert from "node:assert/strict";
import { ICON_LABELS, ICON_LABEL_MS, ICON_HIT_PX } from "../src/config/icon-labels";
import { FAMILY_KEYS } from "../src/config/style-families";
import { outfitIcons } from "../src/lib/outfit-icons";
import { labelReduce, createLabelStore } from "../src/lib/icon-label";
import type { OutfitTags } from "../src/outfits/tags";

const tags = (o: Partial<OutfitTags> = {}) => ({ style_primary: "classic", season_primary: "winter", occasion: "everyday", boldness: "calm", contrast: false, rain: false, formality_level: "casual", palette: { kind: "neutral" }, ...o }) as unknown as OutfitTags;

test("every icon id the code can show has a one/two-word label", () => {
  const ids = [...FAMILY_KEYS.map((f) => `family-${f}`), ...["spring", "summer", "autumn", "winter"].map((s) => `season-${s}`),
    "rain", "evening", "office", "resort", "contrast", "bold", "tonal", "colourful", "formal", "item-accessory", "item-shoes", "item-top", "item-bottom", "dir-men", "dir-women"];
  for (const id of ids) assert.ok((ICON_LABELS as Record<string, string>)[id], id);
  assert.equal(Object.keys(ICON_LABELS).length, ids.length);
  for (const l of Object.values(ICON_LABELS)) assert.ok(l.split(" ").length <= 2);
  assert.equal(ICON_LABELS["season-winter"], "Winter");
  assert.ok(ICON_LABEL_MS === 1500 && ICON_HIT_PX.w >= 30 && ICON_HIT_PX.h >= 32);
});

test("label reducer: show, replace, toggle off, hide, stale expire ignored", () => {
  assert.equal(labelReduce(null, { type: "tap", key: "a" }), "a");
  assert.equal(labelReduce("a", { type: "tap", key: "b" }), "b");
  assert.equal(labelReduce("a", { type: "tap", key: "a" }), null);
  assert.equal(labelReduce("a", { type: "hide" }), null);
  assert.equal(labelReduce("b", { type: "expire", key: "a" }), "b");
});

test("label store: auto-hide after the duration, a new tap restarts it, interaction hides at once", () => {
  const q: { f: () => void; ms: number; dead?: boolean }[] = [];
  const s = createLabelStore({ set: (f, ms) => { const h = { f, ms }; q.push(h); return h; }, clear: (h) => { (h as { dead?: boolean }).dead = true; } }, 1500);
  const fire = () => { const h = q.filter((x) => !x.dead).pop(); if (h) { h.dead = true; h.f(); } };
  s.dispatch({ type: "tap", key: "o:rain" }); assert.equal(s.get(), "o:rain"); assert.equal(q[0].ms, 1500);
  s.dispatch({ type: "tap", key: "o:bold" }); assert.equal(s.get(), "o:bold"); assert.ok(q[0].dead);
  fire(); assert.equal(s.get(), null);
  s.dispatch({ type: "tap", key: "o:rain" }); s.dispatch({ type: "hide" }); assert.equal(s.get(), null);
  s.dispatch({ type: "tap", key: "o:rain" }); s.dispatch({ type: "tap", key: "o:rain" }); assert.equal(s.get(), null);
  assert.equal(q.filter((x) => !x.dead).length, 0);
});

test("icons for a generated outfit come from its tags like in the feed; too few attributes = none", () => {
  assert.deepEqual(outfitIcons(tags()), ["family-smart", "season-winter"]);
  assert.deepEqual(outfitIcons(tags({ rain: true, contrast: true })), ["family-smart", "season-winter", "rain", "contrast"]);
  assert.deepEqual(outfitIcons(tags({ style_primary: "unknown" as never, season_primary: "all" })), []);
  assert.deepEqual(outfitIcons(null), []);
  assert.deepEqual(outfitIcons(tags()), outfitIcons(tags()));   // same pieces -> same icons (no dependence on likes)
});
