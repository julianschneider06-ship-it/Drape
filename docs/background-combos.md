# Background combinations (season x style family), analysis (Prompt 93)

Read-only analysis. Nothing was implemented, no data was changed, no AI was called, no money spent. Date: 2026-11-09.
Method: `scripts/sim-background-combos.ts` (new, read-only) calls the public `POST /api/dynamic` of production like the app does (fresh device, no style picks, no taste, default hybrid composer, `rs` seed 1), 1,000 outfits per direction (all unique). Tags come straight from each outfit's `tags` (the same data the icons use). Pool counts: read-only SQL on `outfit_pool` (rpc/token not needed, the Supabase tool was enough).
Note: a fresh hybrid device first sees the fixed starter set (precomputed) and then the on-demand composer; the simulation measures the composer, which serves nearly all outfits. Statistical error of one share is about +/- 1.5 points.

## How the two parts are computed in code

- **Dominant season** = `dominantSeason(tags)` in `src/lib/season-decor.ts`: `tags.season_primary` is one of spring|summer|autumn|winter and `tags.season_fit >= SEASON_DECOR.minFit` (0.4, `src/config/season-decor.ts`), else `null` = "no clear season". `season_primary` comes from `outfitSeason` (`src/outfits/season.ts`): intersect the pieces' season lists (neutral accessories only vote), weight deciding pieces (outerwear 2.5, shorts/boots/sandals/beanie/scarf/gloves 2, ...), pick the most specific season; `all` only for truly seasonless outfits. In practice `all` never occurred in 2,000 outfits; "none" is only low fit (1.1%/1.2%). The season icon (`outfitIcons`) shows `season_primary` even at low fit, the decoration does not; for backgrounds use the decoration rule (fit-gated), same as the existing decor.
- **Dominant style family** = `familyOf(tags.style_primary)` (`src/config/style-families.ts`). `style_primary` = the style with the largest summed share over the outfit's main pieces (`outfitTags` in `src/outfits/tags.ts`). This is exactly what the small family icon at the top left uses (`outfitIcons`), so the background matches the icon. There is a second notion, `style_distinct` (the style that stands out most against the catalogue average, used for the outfit's feed label): its family differs from the primary's in 21% (men) / 16% (women) of outfits and over-represents active; it is NOT used by the icon, so it is not recommended. Every outfit has a family (0 unmapped).
- **Combination** = (dominant season or none) x (family of `style_primary`).

## (a) Attribute types and values

| Attribute | Values | Where used |
|---|---|---|
| Style family (5) | smart, street, active, rugged, soft | family icon (`family-<name>`), proposed background axis |
| Styles in family smart (8) | old_money, quiet_luxury, classic, business_casual, preppy, dark_academia, minimalism, scandi | via `style_primary` |
| street (6) | streetwear, skater, y2k, grunge, punk_edgy, techwear | |
| active (4) | sporty, athleisure, gorpcore, retro_sport | |
| rugged (3) | workwear, western, vintage | |
| soft (3) | coquette, boho, resort | |
| Season | spring, summer, autumn, winter, all (all = no icon, no decoration; never seen) | season icon, season decoration |
| Season fit | 0..1, decoration needs >= 0.4 | decoration only |
| Extra icons (max 3, in this order) | rain (bool); occasion evening / office / resort (other occasions: everyday, active get no icon); contrast (bool); boldness bold (calm = none); palette kind tonal / colourful (neutral = none); formality formal (casual, smart_casual = none, formal only when no evening/office icon) | icon row only |
| Other tags (no icon) | weather warm/mild/cold, silhouette relaxed/regular/tailored, has_outer_layer, sale_count, style_secondary, style_distinct | not proposed for backgrounds |
| Search-only icons | item-accessory/shoes/top/bottom, dir-men/dir-women | not outfit related |

## (b) Season x family matrix (1,000 hybrid outfits per direction)

Counts (= per mille; divide by 10 for %):

| Men | smart | street | active | rugged | soft | sum |
|---|---|---|---|---|---|---|
| spring | 91 | 59 | 31 | 5 | 0 | 186 |
| summer | 102 | 87 | 48 | 0 | 0 | 237 |
| autumn | 107 | 68 | 44 | 44 | 0 | 263 |
| winter | 132 | 86 | 59 | 26 | 0 | 303 |
| none | 4 | 3 | 3 | 1 | 0 | 11 |
| sum | 436 | 303 | 185 | 76 | 0 | 1000 |

| Women | smart | street | active | rugged | soft | sum |
|---|---|---|---|---|---|---|
| spring | 64 | 42 | 44 | 4 | 0 | 154 |
| summer | 66 | 81 | 76 | 1 | 29 | 253 |
| autumn | 126 | 64 | 42 | 16 | 0 | 248 |
| winter | 168 | 78 | 67 | 19 | 1 | 333 |
| none | 2 | 2 | 8 | 0 | 0 | 12 |
| sum | 426 | 267 | 237 | 40 | 30 | 1000 |

Family shares: men smart 43.6 / street 30.3 / active 18.5 / rugged 7.6 / soft 0; women smart 42.6 / street 26.7 / active 23.7 / rugged 4.0 / soft 3.0. Season shares: men winter 30 / autumn 26 / summer 24 / spring 19; women winter 33 / summer 25 / autumn 25 / spring 15.

Stored pool (active `outfit_pool`, by the pool's own `style_key` label, which can differ from a composed outfit's `style_primary`; the pool has NO season column and season is never stored, so a season split is not available without composing): men 4,335 = smart 2,279 (52.6%), street 773 (17.8%), active 699 (16.1%), rugged 504 (11.6%), soft 80 (1.8%); women 5,265 = smart 2,550 (48.4%), street 883 (16.8%), active 816 (15.5%), rugged 405 (7.7%), soft 611 (11.6%). The pool is more "smart" and more "soft" (women) than what the hybrid composer serves; the composer is what users see, so the simulation is the main basis. Largest single styles in the pool: classic (men 1,236), minimalism (women 1,075).

## (c) How many combinations cover the feed

| | combinations with any outfit | cover 90% | cover 99% |
|---|---|---|---|
| Men | 19 of 25 | 12 | 16 |
| Women | 21 of 25 | 12 | 16 |

(of 25 = 5 seasons-or-none x 5 families; the 20 real-season combinations plus 5 "none" cells.)

## (d) Never / almost never

- Never (0 of 1000) in both: spring|soft, autumn|soft; men also summer|soft, winter|soft, summer|rugged (men soft = 0 although 80 resort/ pool outfits exist: they lose to other styles in the composer).
- Almost never (<= 5 of 1000, <= 0.5%): spring|rugged (men 5, women 4), summer|rugged (women 1), winter|soft (women 1), and all "none" cells except women none|active (8).
- "No clear season" is only about 1.1-1.2% in total.

## (e) Suggested sets

- **Minimal first set: 4 seasons x 3 families (smart, street, active) = 12 combinations = 36 images.** Covers 91.4% of men and 91.8% of women outfits. Outfits of other families (rugged, soft, none) use the fallback below.
- **Fallback:** `<season>-any-1..3` per season (4 x 3 = 12 images) or, for "no clear season", `neutral-1..3` (3 images). Cheap and means no outfit is ever without a background. First rollout with minimal set + fallbacks = 51 images.
- **Extended set (recommended step 2): add rugged autumn + winter and women soft summer = 3 more combos = 9 images** (set of 15 combos, 98.4% men / 98.2% women with those three).
- **Full set: 5 families x 4 seasons = 20 combinations = 60 images, plus `neutral` 3 = 63 images.** The 5 never/almost-never cells (spring|soft, autumn|soft, winter|soft, summer|rugged, spring|rugged) would be drawn for about 0-0.5% of outfits each: not worth it, let them use the season fallback.

## (f) File naming and config shape (proposal, not built)

- Files: `public/backgrounds/<season>-<family>-<1..3>.webp`, season = spring|summer|autumn|winter|neutral, family = smart|street|active|rugged|soft|any. Examples: `winter-smart-2.webp`, `autumn-any-1.webp`, `neutral-any-3.webp`. Existing `public/backgrounds/wishlist.webp` stays as it is.
- Config `src/config/combo-backgrounds.ts`: `{ enabled, count: 3, selection: "stable" | "random", lookup: Record<"<season>|<family>", number /* how many images exist, 0..3 */>, fallback order: exact -> season|any -> neutral -> none }`. The lookup lists only files that exist, so images can be added one by one without code change; a missing file never breaks (falls to the next fallback).
- Pure function `comboKey(tags)` = `${dominantSeason(tags) ?? "neutral"}|${familyOf(tags.style_primary)}` and `pickBackground(tags, outfitKey)` in `src/lib/`, tested like the icons.
- Selection rule options: (1) **stable per outfit id** = hash of the piece ids (`outfit id` is already a hash) mod 3: the same outfit always shows the same image, scrolling back does not flicker, deterministic, testable; (2) random per showing: more variety but flickers when scrolling back and cannot be tested; (3) per session rotation (round robin per combination, by a counter held on the client): even use of the 3 images without flicker within a session. Recommendation: stable per outfit id, with the neighbour rule "never the same image as the previous outfit if its combination is the same" using index 0..2 shift.
- Switching: Profile toggle + `?combobg=0|1` like the stripe background; replaces the Stripe background layer (`LAYER_Z` stripe slot) while on. Preload only the images of the current and next outfit; use `webp`, `decoding=async`.

## (g) Image brief for the phone background

- Portrait, **1170 x 2532 px** (iPhone 13/14 aspect 9:19.5), delivered as 1170x2532 webp, quality about 80, target <= 250 KB per image (63 images = about 16 MB at most, loaded lazily one at a time). Displayed with `object-fit: cover` (`WishlistBackground.tsx` already does this for a 900x1600 image); keep important content away from the edges because `cover` crops sides on wider/shorter phones (tall Android 9:20 and small iPhones 9:16 crop top/bottom or sides by up to about 8%).
- Full screen, edge to edge, behind the status bar, the header and the tab bar (like the stripe layer).
- Safe areas (percent of image height, iPhone 390x844 reference): top 0-14% = status bar + glass header capsule (keep calm, no detail); bottom 88-100% = glass tab bar + home indicator (calm); left/right 4% margin; the right 48 px (12%) is the action rail (heart). Products fill roughly the centre 14%-86% in a column about 80% wide: the middle must be low contrast, soft, slightly blurred or very light in tone so greyed and coloured products stay readable. Put the interest (season mood: sky, foliage, snow, light) in the top and bottom bands and the corners; avoid any text, people, faces, logos and strong horizontal lines.
- Colour: light to mid tones with a luminance range that keeps dark products visible (avoid black or very saturated backgrounds); each family has a mood (smart = calm, clean, warm neutral; street = urban concrete, graffiti-free; active = outdoor, sky, trail; rugged = wood, leather, dust; soft = pastel, florals, light fabric), each season a palette (spring fresh green, summer warm sun, autumn amber, winter cool blue-white). The 3 images of one combination share mood and palette but differ in composition.

## (h) Open decisions and recommendations

1. Which family notion: recommend `style_primary` family (same as the icon). `style_distinct` would disagree with the icon in 16-21% of outfits.
2. How many first: recommend minimal 12 combos + 4 season fallbacks + neutral = 51 images (about 92% exact match, the rest fallback), extend to 15 combos later.
3. Selection rule: recommend stable per outfit id (see f).
4. Replace or combine with the Stripe background and the season decoration (sun, tree, wave, meadow)? Recommend: image background replaces stripes (own switch), season decoration stays optional on top; check the decor sprites on the new images before deciding.
5. Men soft family: men get 0 soft outfits in the feed, so no soft images for men (they share the women's soft images only if needed later).
6. Rare combos: recommend no own images (use season fallback), re-measure after new shops.
7. Phone aspect: 1170x2532 master; or ask for 1290x2796 if sharpness matters; recommend 1170x2532.
8. Scope: For You feed only, or also Generate Outfits / My Outfits (they already have the Drape background and the stripe switch). Recommend For You first.
