import { test } from "node:test";
import assert from "node:assert/strict";
import { dominantSeason, decorClip, decorWindow, effectiveSeason } from "../src/lib/season-decor";
import { meadowArt, sunArt, spotPieces, wobblyLine } from "../src/lib/season-decor-art";
import { SEASON_DECOR } from "../src/config/season-decor";
import { DEFAULT_PREFS, cleanPrefs } from "../src/lib/shop-pref";

test("dominant season: clear season only, never for all-season / unclear / no data", () => {
  assert.equal(dominantSeason({ season_primary: "summer", season_fit: 0.9 }), "summer");
  assert.equal(dominantSeason({ season_primary: "winter", season_fit: SEASON_DECOR.minFit }), "winter");
  assert.equal(dominantSeason({ season_primary: "all", season_fit: 1 }), null);
  assert.equal(dominantSeason({ season_primary: "autumn", season_fit: 0.3 }), null);   // pieces disagree (tie): low fit
  assert.equal(dominantSeason(null), null);
  assert.equal(dominantSeason(undefined), null);
});

test("clip range: the outfit owns [i*h - scroll, +h] of the screen", () => {
  const h = 800;
  assert.deepEqual(decorClip(2, 1600, h), { top: 0, bottom: 0 });          // at rest on outfit 2: whole screen
  assert.equal(decorClip(1, 1600, h), null);                                // previous outfit fully gone
  assert.equal(decorClip(3, 1600, h), null);                                // next one not yet there
  assert.deepEqual(decorClip(1, 1200, h), { top: 0, bottom: 400 });         // halfway: previous outfit keeps the top half
  assert.deepEqual(decorClip(2, 1200, h), { top: 400, bottom: 0 });         // next outfit has the bottom half
  assert.deepEqual(decorClip(1, 1000, h), { top: 0, bottom: 200 });
  assert.deepEqual(decorClip(2, 1000, h), { top: 600, bottom: 0 });
  assert.deepEqual(decorClip(0, -30, h), { top: 30, bottom: 0 });           // rubber band above the first outfit
  assert.equal(decorClip(0, 0, 0), null);
  for (let st = 0; st <= 1600; st += 37) {                                  // the two neighbours never overlap and never leave a gap
    const a = decorClip(1, st, h), b = decorClip(2, st, h);
    const visA = a ? h - a.top - a.bottom : 0, visB = b ? h - b.top - b.bottom : 0;
    if (st >= 800 && st <= 1600) { assert.ok(Math.abs(visA + visB - h) < 1e-6, `st ${st}`); if (a && b) assert.ok(a.bottom + b.top === h, `st ${st}`); }
  }
});

test("window: nearest outfit and both neighbours, inside the list", () => {
  assert.deepEqual(decorWindow(0, 800, 5), [0, 1]);
  assert.deepEqual(decorWindow(1600, 800, 5), [1, 2, 3]);
  assert.deepEqual(decorWindow(3200, 800, 5), [3, 4]);
  assert.deepEqual(decorWindow(0, 800, 0), []);
  assert.deepEqual(decorWindow(0, 0, 3), []);
  for (let st = 0; st <= 3200; st += 50) { const w = decorWindow(st, 800, 5); for (const i of [Math.floor(st / 800), Math.ceil(st / 800)]) assert.ok(w.includes(i), `st ${st} needs ${i}`); }
});

test("setting: link wins, otherwise the device choice; default on and saved with the profile", () => {
  assert.equal(effectiveSeason(null, true), true);
  assert.equal(effectiveSeason(null, false), false);
  assert.equal(effectiveSeason("0", true), false);
  assert.equal(effectiveSeason("1", false), true);
  assert.equal(effectiveSeason("x", false), false);
  assert.equal(DEFAULT_PREFS.season, true);
  assert.equal(cleanPrefs({ v: 1, season: false }).season, false);
  assert.equal(cleanPrefs({ v: 1, season: "no" }).season, true);
  assert.equal(cleanPrefs({ v: 1, sale: false }).season, true);   // old saves keep working
});

test("drawing is deterministic and the config is sane", () => {
  assert.equal(wobblyLine([[0, 0], [5, 5], [10, 0]], 3), wobblyLine([[0, 0], [5, 5], [10, 0]], 3));
  assert.deepEqual(sunArt(), sunArt());
  assert.deepEqual(meadowArt(400), meadowArt(400));
  assert.equal(sunArt().rays.length, SEASON_DECOR.sun.rays);
  assert.equal(spotPieces(0, 400).length, SEASON_DECOR.spots.count);
  assert.deepEqual(spotPieces(1, 400), spotPieces(1, 400));
  assert.equal(SEASON_DECOR.spots.places.length, 2);
  for (const p of SEASON_DECOR.spots.places) assert.ok(p.y0 >= 0 && p.y1 <= 1 && p.y0 < p.y1 && p.x >= 0 && p.x < 1);
  assert.ok(!SEASON_DECOR.spots.places.some((p) => p.x < 0.3 && p.y0 < 0.2));   // not over the attribute icons (top left)
});
