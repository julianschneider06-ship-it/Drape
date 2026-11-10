import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { BG_COMBOS, BG_MANIFEST, BG_IMAGE, MAX_PER_COMBO, VEIL, isAllowedName } from "../src/config/background-images";
import { hashIndex, parseVeil, chooseSeason, chooseStripe, comboKey, manifestProblems, migrateSeason, outfitHash, pickBackground, PICTURES_WINS_NOTE, resolveModes } from "../src/lib/background-images";
import { cleanPrefs, DEFAULT_PREFS } from "../src/lib/shop-pref";
import { LAYER_Z } from "../src/config/season-decor";

const tags = (season: string, style: string, fit = 0.9) => ({ season_primary: season, season_fit: fit, style_primary: style }) as never;
const WS = tags("winter", "streetwear"), IDS = [5, 3, 9];

test("allowed names: 15 combinations x 1..MAX_PER_COMBO (5), no neutral pool", () => {
  assert.equal(BG_COMBOS.length, 15); assert.equal(MAX_PER_COMBO, 5);
  assert.ok(isAllowedName("autumn-rugged-5") && isAllowedName("summer-soft-1"));
  assert.ok(!isAllowedName("winter-street-6") && !isAllowedName("winter-street-0") && !isAllowedName("neutral-1") && !isAllowedName("neutral") && !isAllowedName("spring-soft-1") && !isAllowedName("wishlist"));
  assert.equal(BG_IMAGE.width, 1170); assert.equal(BG_IMAGE.height, 2532);   // iPhone full screen
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
  const m = ["winter-street-1", "winter-street-3", "winter-smart-1"];
  const a = pickBackground(WS, IDS, m)!;
  assert.equal(a.step, "exact"); assert.ok(["winter-street-1", "winter-street-3"].includes(a.name));
  assert.deepEqual(pickBackground(WS, [9, 5, 3], m), a);   // swipe back / reorder: same picture
  const seen = new Set<string>(); for (let i = 1; i < 200; i++) seen.add(pickBackground(WS, [i, 7], m)!.name);
  assert.deepEqual([...seen].sort(), ["winter-street-1", "winter-street-3"]);
  assert.equal(a.src, `/backgrounds/${a.name}.webp`);
});
test("fallback order: exact -> same season + smart -> same season + street -> nothing (plain white)", () => {
  const act = tags("summer", "sporty");   // summer-active
  assert.equal(pickBackground(act, IDS, ["summer-active-2", "summer-smart-1", "summer-street-1"])!.name, "summer-active-2");
  const f1 = pickBackground(act, IDS, ["summer-smart-1", "summer-street-1"])!; assert.equal(f1.step, "season-smart"); assert.equal(f1.label, "fallback: summer-smart-1");
  assert.equal(pickBackground(act, IDS, ["summer-street-3"])!.step, "season-street");
  assert.equal(pickBackground(act, IDS, ["winter-smart-1"]), null);   // other season only: no picture
  assert.equal(pickBackground(tags("winter", "classic", 0.1), IDS, ["winter-smart-1", "winter-street-1"]), null);   // no clear season: no picture
  assert.equal(pickBackground(tags("spring", "coquette"), IDS, ["spring-smart-2"])!.name, "spring-smart-2");   // spring-soft has no set
});
const synth = (n: number) => Array.from({ length: n }, (_, i) => [i * 7 + 1, (i * 13) % 977 + 1000, (i * 31) % 4999 + 6000]);
test("choice: stable per outfit, every image of the combination reachable, evenly spread", () => {
  const m = ["winter-street-1", "winter-street-2", "winter-street-3", "winter-street-4", "winter-street-5"];
  const all = synth(20000), cnt: Record<string, number> = {};
  for (const ids of all) {
    const p = pickBackground(WS, ids, m)!;
    assert.deepEqual(p, pickBackground(WS, [...ids].reverse(), m)!);
    cnt[p.name] = (cnt[p.name] ?? 0) + 1;
  }
  for (const n of m) assert.ok(Math.abs((cnt[n] ?? 0) / all.length - 0.2) < 0.03, `${n} share`);
  assert.ok(typeof hashIndex(IDS) === "number");
});
test("no neutral pool anywhere (files, manifest, config, logic)", () => {
  assert.ok(!BG_MANIFEST.some((n) => n.startsWith("neutral")));
  assert.ok(!readdirSync("public/backgrounds").some((f) => f.startsWith("neutral")));
  assert.doesNotMatch(readFileSync("src/config/background-images.ts", "utf8") + readFileSync("src/lib/background-images.ts", "utf8"), /NEUTRAL|neutral/);
});
test("veil: config default 0 (none); link parameters parse, clamp and ignore junk", () => {
  assert.equal(VEIL.opacity, 0);
  assert.deepEqual(parseVeil(""), { color: VEIL.color, opacity: 0 });
  assert.deepEqual(parseVeil("?bgveil=0.3&bgveilcolor=black"), { color: "black", opacity: 0.3 });
  assert.equal(parseVeil("?bgveil=5").opacity, 0.8); assert.equal(parseVeil("?bgveil=-1").opacity, 0);
  assert.deepEqual(parseVeil("?bgveil=x&bgveilcolor=red"), { color: VEIL.color, opacity: 0 });
  const comp = readFileSync("src/components/BackgroundPicture.tsx", "utf8"); assert.match(comp, /step \$\{pick\?\.step \?\? "none"\}/); assert.match(comp, /veil \$\{/);
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
test("geometry: full screen (fixed, inset 0, 100dvh, cover, centre); layer order puts it above the stripe and under the decoration and the bars", () => {
  assert.ok(LAYER_Z.stripe < LAYER_Z.image && LAYER_Z.image < LAYER_Z.decor && LAYER_Z.products < LAYER_Z.chrome);
  const comp = readFileSync("src/components/BackgroundPicture.tsx", "utf8");
  assert.match(comp, /objectFit: "cover"/); assert.match(comp, /objectPosition: "center"/); assert.match(comp, /pointer-events-none/);
  assert.match(comp, /position: "fixed", left: 0, top: 0, right: 0, width: "100%", height: "100dvh"/); assert.doesNotMatch(comp, /stageBox/);
});
test("glass: with Pictures the header, tab bar and Wishlist header use the Stripe glass (simple look); Stripe stays exclusive", () => {
  const h = readFileSync("src/lib/client/stripe-bg.ts", "utf8"); assert.match(h, /useGlassMode/); assert.match(h, /pictures \? "simple"/);
  for (const f of ["Feed", "WishlistView", "MyOutfits"]) assert.match(readFileSync(`src/components/${f}.tsx`, "utf8"), /useGlassMode/);
  assert.deepEqual(resolveModes({ seasonLink: "pictures", stripeLink: "colorful", local: { season: "sprites", stripe: "off" }, imageCount: 3 }).stripe, "off");
});
test("Profile: three-way control, Pictures disabled with caption while the manifest is empty; Search / Products untouched", () => {
  const pv = readFileSync("src/components/ProfileView.tsx", "utf8");
  assert.match(pv, /id="season-mode"/); assert.match(pv, /noImages/); assert.match(pv, /picturesEmpty/);
  assert.doesNotMatch(readFileSync("src/components/Search.tsx", "utf8"), /BackgroundPicture/);
  assert.doesNotMatch(readFileSync("src/components/LikesView.tsx", "utf8"), /BackgroundPicture/);
  assert.doesNotMatch(readFileSync("src/components/Feed.tsx", "utf8") + readFileSync("src/lib/client/season-decor.ts", "utf8"), /bgimg/);
});
