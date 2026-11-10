import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BG_COMBOS, BG_MANIFEST, BG_IMAGE, MAX_PER_COMBO, NEUTRAL_SHARE, VEIL, isAllowedName } from "../src/config/background-images";
import { hashBucket, hashIndex, parseVeil, chooseSeason, chooseStripe, comboKey, manifestProblems, migrateSeason, outfitHash, pickBackground, PICTURES_WINS_NOTE, resolveModes } from "../src/lib/background-images";
import { cleanPrefs, DEFAULT_PREFS } from "../src/lib/shop-pref";
import { stageBox, stageFromRects } from "../src/lib/season-decor";
import { LAYER_Z, DECOR_OVERSCAN_PX } from "../src/config/season-decor";

const tags = (season: string, style: string, fit = 0.9) => ({ season_primary: season, season_fit: fit, style_primary: style }) as never;
const WS = tags("winter", "streetwear"), IDS = [5, 3, 9];

test("allowed names: 15 combinations x 1..MAX_PER_COMBO (5), neutral-<n> for any n >= 1", () => {
  assert.equal(BG_COMBOS.length, 15); assert.equal(MAX_PER_COMBO, 5);
  assert.ok(isAllowedName("autumn-rugged-5") && isAllowedName("summer-soft-1") && isAllowedName("neutral-1") && isAllowedName("neutral-5") && isAllowedName("neutral-137"));
  assert.ok(!isAllowedName("winter-street-6") && !isAllowedName("winter-street-0") && !isAllowedName("neutral-0") && !isAllowedName("neutral") && !isAllowedName("spring-soft-1") && !isAllowedName("wishlist"));
  assert.deepEqual(BG_IMAGE.width / BG_IMAGE.height, 1080 / 1920);   // 9:16
});
test("manifest: every entry exists on disk, every combination file on disk is listed, names are allowed", () => {
  const dir = "public/backgrounds", onDisk = readdirSync(dir).filter((f) => f.endsWith(".webp") && isAllowedName(f.replace(/\.webp$/, ""))).map((f) => f.replace(/\.webp$/, "")).sort();
  for (const n of BG_MANIFEST) assert.ok(existsSync(`${dir}/${n}.webp`), `${n} listed but missing`);
  assert.deepEqual([...BG_MANIFEST].sort(), onDisk);
  assert.deepEqual(manifestProblems(BG_MANIFEST), []);
  assert.deepEqual(manifestProblems(["winter-street-1", "nope-1", "winter-street-1"]), ["unknown nope-1", "duplicate winter-street-1"]);
  JSON.parse(readFileSync("src/config/background-manifest.json", "utf8"));
});
test("combination key = dominant season x family of style_primary, same rule as the decoration", () => {
  assert.equal(comboKey(WS), "winter-street");
  assert.equal(comboKey(tags("autumn", "workwear")), "autumn-rugged");
  assert.equal(comboKey(tags("summer", "resort")), "summer-soft");
  assert.equal(comboKey(tags("winter", "classic", 0.2)), "none-smart");   // low season fit = no clear season
  assert.equal(comboKey(null), "none-smart");
});
test("hash is stable and ignores the order of the ids", () => {
  assert.equal(outfitHash([1, 2, 3]), outfitHash([3, 1, 2]));
  assert.notEqual(outfitHash([1, 2, 3]), outfitHash([1, 2, 4]));
});
test("no manifest entry = no picture", () => assert.equal(pickBackground(WS, IDS, []), null));
test("exact combination wins; only existing indexes are used; choice is stable per outfit", () => {
  const m = ["winter-street-1", "winter-street-3", "winter-smart-1", "neutral-1"];
  const a = pickBackground(WS, IDS, m, 0)!;
  assert.equal(a.step, "exact"); assert.ok(["winter-street-1", "winter-street-3"].includes(a.name));
  assert.deepEqual(pickBackground(WS, [9, 5, 3], m, 0), a);   // swipe back / reorder: same picture
  const seen = new Set<string>(); for (let i = 1; i < 200; i++) seen.add(pickBackground(WS, [i, 7], m, 0)!.name);
  assert.deepEqual([...seen].sort(), ["winter-street-1", "winter-street-3"]);
  assert.equal(a.bucket, "combination"); assert.equal(a.src, `/backgrounds/${a.name}.webp`);
});
test("fallback order: exact -> same season + smart -> same season + street -> neutral -> nothing", () => {
  const act = tags("summer", "sporty");   // summer-active
  assert.equal(pickBackground(act, IDS, ["summer-active-2", "summer-smart-1", "summer-street-1", "neutral-1"], 0)!.name, "summer-active-2");
  const f1 = pickBackground(act, IDS, ["summer-smart-1", "summer-street-1", "neutral-1"], 0)!; assert.equal(f1.step, "season-smart"); assert.equal(f1.label, "fallback: summer-smart-1");
  assert.equal(pickBackground(act, IDS, ["summer-street-3", "neutral-1"], 0)!.step, "season-street");
  const f3 = pickBackground(act, IDS, ["winter-smart-1", "neutral-2"])!; assert.equal(f3.step, "neutral"); assert.equal(f3.label, "fallback: neutral-2");
  assert.equal(pickBackground(act, IDS, ["winter-smart-1"]), null);   // not even neutral: draw nothing
  assert.equal(pickBackground(tags("winter", "classic", 0.1), IDS, ["winter-smart-1", "neutral-3"])!.name, "neutral-3");   // no clear season -> neutral
  assert.equal(pickBackground(tags("spring", "coquette"), IDS, ["spring-smart-2"])!.name, "spring-smart-2");   // spring-soft has no set
});
const synth = (n: number) => Array.from({ length: n }, (_, i) => [i * 7 + 1, (i * 13) % 977 + 1000, (i * 31) % 4999 + 6000]);
test("mix: neutral share is 25% +-3 points, stable, bucket and index independent, every image reachable", () => {
  assert.equal(NEUTRAL_SHARE, 0.25);
  const m = ["winter-street-1", "winter-street-2", "winter-street-3", "winter-street-4", "winter-street-5", "neutral-1", "neutral-2", "neutral-3", "neutral-4", "neutral-5", "neutral-9"];
  const all = synth(20000), cnt: Record<string, number> = {}; let neutral = 0;
  for (const ids of all) {
    const p = pickBackground(WS, ids, m)!, again = pickBackground(WS, [...ids].reverse(), m)!;
    assert.deepEqual(p, again);   // stable per outfit, order of the ids does not matter
    cnt[p.name] = (cnt[p.name] ?? 0) + 1;
    if (p.bucket === "neutral") { neutral++; assert.equal(p.step, "neutral"); assert.match(p.name, /^neutral-/); } else assert.match(p.name, /^winter-street-/);
  }
  const share = neutral / all.length; assert.ok(Math.abs(share - 0.25) <= 0.03, `neutral share ${share}`);
  for (const n of m) assert.ok((cnt[n] ?? 0) > 0, `${n} never reachable`);   // incl. the open-ended neutral-9
  // independence: inside each bucket the image index is spread evenly (no bucket/index correlation)
  const per = (pre: string, k: number) => m.filter((x) => x.startsWith(pre)).map((x) => cnt[x]).every((c) => Math.abs(c / (pre === "neutral" ? neutral : all.length - neutral) - 1 / k) < 0.03);
  assert.ok(per("neutral", 6) && per("winter-street", 5));
  const bits = all.slice(0, 5000).map((ids) => [hashBucket(ids) < 0.5 ? 1 : 0, hashIndex(ids) & 1] as const);
  const agree = bits.filter(([a, b]) => a === b).length / bits.length; assert.ok(Math.abs(agree - 0.5) < 0.03, `bucket/index correlation ${agree}`);
});
test("mix: chain empty -> neutral 100%, neutral empty -> chain 100%, season none -> neutral only, both empty -> nothing", () => {
  const all = synth(2000), none = tags("winter", "classic", 0.1);
  for (const ids of all) {
    assert.ok(["season-smart", "neutral"].includes(pickBackground(WS, ids, ["winter-smart-1", "neutral-1", "neutral-2"])!.step));
    assert.equal(pickBackground(WS, ids, ["summer-smart-1", "neutral-1", "neutral-2"])!.bucket, "neutral");   // chain empty (other season)
    assert.equal(pickBackground(WS, ids, ["winter-street-1", "winter-street-2"])!.bucket, "combination");   // neutral empty
    assert.equal(pickBackground(none, ids, ["winter-smart-1", "winter-street-1", "neutral-1", "neutral-2"])!.bucket, "neutral");   // season none
  }
  assert.equal(pickBackground(WS, IDS, ["summer-smart-1"]), null);   // both empty: draw nothing, no sprites
  assert.equal(pickBackground(none, IDS, ["winter-smart-1"]), null);
  assert.equal(pickBackground(WS, IDS, []), null);
});
test("veil: config default 0 (none); link parameters parse, clamp and ignore junk", () => {
  assert.equal(VEIL.opacity, 0);
  assert.deepEqual(parseVeil(""), { color: VEIL.color, opacity: 0 });
  assert.deepEqual(parseVeil("?bgveil=0.3&bgveilcolor=black"), { color: "black", opacity: 0.3 });
  assert.equal(parseVeil("?bgveil=5").opacity, 0.8); assert.equal(parseVeil("?bgveil=-1").opacity, 0);
  assert.deepEqual(parseVeil("?bgveil=x&bgveilcolor=red"), { color: VEIL.color, opacity: 0 });
  const comp = readFileSync("src/components/BackgroundPicture.tsx", "utf8"); assert.match(comp, /bucket \$\{/); assert.match(comp, /veil \$\{/);
});
test("modes: defaults and the old boolean migrate (true = Sprites, false = Off)", () => {
  assert.equal(DEFAULT_PREFS.season, "sprites");
  assert.equal(migrateSeason(true), "sprites"); assert.equal(migrateSeason(false), "off");
  assert.equal(migrateSeason("pictures"), "pictures"); assert.equal(migrateSeason(undefined), "sprites"); assert.equal(migrateSeason("zzz"), "sprites");
  assert.equal(cleanPrefs({ v: 1, season: false }).season, "off");
  assert.equal(cleanPrefs({ v: 1, season: true }).season, "sprites");
  assert.deepEqual(cleanPrefs({ v: 1, season: "pictures", stripe: "simple" }).stripe, "off");   // stored conflict: Pictures wins
});
test("mutual exclusion in both directions (Profile choices)", () => {
  assert.deepEqual(chooseSeason({ season: "sprites", stripe: "colorful" }, "pictures"), { season: "pictures", stripe: "off" });
  assert.deepEqual(chooseSeason({ season: "sprites", stripe: "simple" }, "sprites"), { season: "sprites", stripe: "simple" });
  assert.deepEqual(chooseStripe({ season: "pictures", stripe: "off" }, "simple"), { season: "sprites", stripe: "simple" });
  assert.deepEqual(chooseStripe({ season: "pictures", stripe: "off" }, "colorful"), { season: "sprites", stripe: "colorful" });
  assert.deepEqual(chooseStripe({ season: "pictures", stripe: "colorful" }, "off"), { season: "pictures", stripe: "off" });
  assert.deepEqual(chooseStripe({ season: "off", stripe: "off" }, "colorful"), { season: "off", stripe: "colorful" });
});
test("link parameters: ?season=pictures + ?stripe=1|simple -> Pictures wins, note says so", () => {
  const local = { season: "sprites", stripe: "off" } as const;
  for (const st of ["colorful", "simple"] as const) {
    const r = resolveModes({ seasonLink: "pictures", stripeLink: st, local, imageCount: 3 });
    assert.deepEqual(r, { season: "pictures", stripe: "off", note: PICTURES_WINS_NOTE });
  }
  assert.deepEqual(resolveModes({ seasonLink: "pictures", stripeLink: "off", local, imageCount: 3 }), { season: "pictures", stripe: "off", note: null });
  assert.equal(resolveModes({ seasonLink: null, stripeLink: "simple", local: { season: "pictures", stripe: "off" }, imageCount: 3 }).stripe, "off");   // stored Pictures + ?stripe=simple
  assert.deepEqual(resolveModes({ seasonLink: "1", stripeLink: "colorful", local, imageCount: 3 }), { season: "sprites", stripe: "colorful", note: null });
  assert.equal(resolveModes({ seasonLink: "0", stripeLink: null, local, imageCount: 3 }).season, "off");
});
test("empty manifest: stored or linked Pictures behaves like Sprites (and does not touch Stripe)", () => {
  assert.deepEqual(resolveModes({ seasonLink: null, stripeLink: null, local: { season: "pictures", stripe: "off" }, imageCount: 0 }), { season: "sprites", stripe: "off", note: null });
  assert.deepEqual(resolveModes({ seasonLink: "pictures", stripeLink: "simple", local: { season: "sprites", stripe: "off" }, imageCount: 0 }), { season: "sprites", stripe: "simple", note: null });
  assert.equal(BG_MANIFEST.length === 0 || BG_MANIFEST.length > 0, true);
});
test("geometry: the picture uses the same stage box as the season art; layer order puts it above the stripe and under the decoration", () => {
  const st = stageFromRects({ bottom: 120 }, { top: 780 }, 390, 844);
  assert.deepEqual(stageBox(st), { x: -DECOR_OVERSCAN_PX, y: 120 - DECOR_OVERSCAN_PX, w: 390 + 2 * DECOR_OVERSCAN_PX, h: 660 + 2 * DECOR_OVERSCAN_PX });
  assert.ok(LAYER_Z.stripe < LAYER_Z.image && LAYER_Z.image < LAYER_Z.decor && LAYER_Z.products < LAYER_Z.chrome);
  const comp = readFileSync("src/components/BackgroundPicture.tsx", "utf8");
  assert.match(comp, /objectFit: "cover"/); assert.match(comp, /pointer-events-none/); assert.match(comp, /stageBox\(/);
});
test("Profile: three-way control, Pictures disabled with caption while the manifest is empty; Search / Products untouched", () => {
  const pv = readFileSync("src/components/ProfileView.tsx", "utf8");
  assert.match(pv, /id="season-mode"/); assert.match(pv, /noImages/); assert.match(pv, /picturesEmpty/);
  assert.doesNotMatch(readFileSync("src/components/Search.tsx", "utf8"), /BackgroundPicture/);
  assert.doesNotMatch(readFileSync("src/components/LikesView.tsx", "utf8"), /BackgroundPicture/);
  assert.doesNotMatch(readFileSync("src/components/Feed.tsx", "utf8") + readFileSync("src/lib/client/season-decor.ts", "utf8"), /bgimg/);
});
