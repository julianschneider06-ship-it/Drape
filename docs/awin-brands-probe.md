# Awin brands feed probe (2026-10-22, read-only)

Second Awin feed, URL only in env `AWIN_FEED_URL_BRANDS` (never printed or stored; note: the stored value had a leading space, trim it before use). Downloaded once (HTTP 200, gzip CSV, 10.8 MB, 42 MB unpacked) to a temp folder, deleted afterwards. Analysis: `scripts/probe-awin-brands.ts` (reads local files, no network), image test: `scripts/probe-awin-usable.ts` (20 random in-stock products per merchant, prompt `ic2` + border-plainness; no local cutout run). Nothing written to the database or repo data. AI cost **$0.024** (cap 0.70).

## 1. Size and merchants
22,557 rows, **28 columns** (first feed 30): same as before, but `merchant_product_category_path`, `is_for_sale`, `stock_quantity` are gone and `stock_status` is new. Category text is only in `merchant_category` / `category_name` and empty for Converse PL, Aussui, Caterboss, so categories below are partly guessed from product names.

19 merchants, **12 already in the first feed, 7 new**:

| merchant | rows | status |
|---|---|---|
| Bennimarceau | 13,359 | old (was 539 rows, now 25x) |
| Brian James | 4,196 | old (was 6,204, now 8 brands) |
| Viaduct | 1,178 | old |
| Converse PL | 554 | **new** |
| Aussui (UK) | 487 | **new** (gift cards, not fashion) |
| Watch Enclave | 457 | old |
| Fashiontamers US | 348 | old |
| MyBeauty.Boutique | 307 | **new** (perfume) |
| Watches of USA | 295 | old |
| Tooled Up | 236 | old |
| Workout For Less | 206 | **new** |
| Bazta IE / Bazta UK | 154 / 144 | **new** (same range as Plusshop) |
| Watch & Watch | 152 | old |
| Plusshop IE / UK | 152 / 143 | old |
| T.LUXY | 129 | old |
| MoreThisWay | 42 | old |
| Caterboss | 18 | **new** (Crocs clogs) |

## 2. Per merchant (fashion = by name/category guess)
| merchant | brands | fashion | currency | in stock | real discount (rrp > price) | aw_deep_link |
|---|---|---|---|---|---|---|
| Bennimarceau | 13 (Nike 8.3k, Adidas 1.6k, New Balance 1.5k, Converse, Vans, Onitsuka Tiger) | 100% (96% shoes) | GBP | 100% | 0 | 100% |
| Brian James | 8 (Tommy Hilfiger, Bugatti, Boss, Tommy Jeans, Helly Hansen) | 100% | EUR + GBP (each row twice) | 100% | 486 | 100% |
| Viaduct | 6 (adidas Originals, Adidas, New Balance) | 100% | GBP | 100% | 1,170 | 100% |
| Converse PL | 1 (Converse) | ~78% (shoes) | PLN | 100% | 0 | 100% |
| Aussui | 11 (gift cards) | 0% | 17 currencies | 100% | 0 | 100% |
| MyBeauty.Boutique | 10 (perfume) | <1% | GBP | 100% | 0 | 100% |
| Workout For Less | 1 (Adidas) | 55% (gloves, supports; mats excluded) | GBP | 100% | 202 | 100% |
| Bazta IE / UK | 4 | 23% / 19% (watches, sunglasses; rest perfume) | EUR / GBP | 100% | 0 | 100% |
| Caterboss | 2 (Crocs) | 100% shoes, 18 rows | EUR | 100% | 0 | 100% |
Old watch / luxury merchants (Watch Enclave 33% in stock, Watch & Watch 84%, Watches of USA, T.LUXY 129 rows, Fashiontamers 348 rows, Tooled Up 236 rows, MoreThisWay 42) are subsets of the first feed; Fashiontamers still has no image (`img` empty for all 348).

## 3. Top 30 brands (rows)
Nike 8,488; Adidas 2,478; Tommy Hilfiger 1,841; New Balance 1,624; Converse 1,106; Bugatti 1,050; Boss 904; Hugo Boss 781; adidas Originals 696; Tommy Jeans 588; Vans 488; Calvin Klein 378; Puma 304; Diesel 250; Onitsuka Tiger 237; ASICS 232; Dsquared2 215; Givenchy 131; Dickies 98; Brooks 95; Crocs 95; Ugg 81; Solomon (sic) 80; The North Face 65; Under Armour 64; Helly Hansen 62; Armani Exchange 59; Superdry 43; Calvin Klein Jeans 24.

## 4. Category mix (rows)
| merchant | shoes | tops | bottoms | outerwear | accessories | other |
|---|---|---|---|---|---|---|
| Bennimarceau | 12,868 | 141 | 30 | 320 | 0 | 0 |
| Brian James | 688 | 1,692 | 1,308 | 400 | 92 | 16 |
| Viaduct | 189 | 543 | 390 | 49 | 7 | 0 |
| Converse PL | 370 | 39 | 16 | 2 | 3 | 124 |
| Workout For Less | 3 | 0 | 0 | 1 | 110 | 92 |
| Bazta IE / UK | 0 | 0 | 0 | 0 | 36 / 27 | 118 / 117 |
| Watch merchants | 0 | 0 | 0 | 0 | all | 0 |
| Fashiontamers | 47 | 100 | 87 | 33 | 81 | 0 |

The feed is **shoes-heavy** (sneakers): 14.2k of 22.5k rows.

## 5. Image usability (20 each, ic2 gate + plain background)
| merchant | usable | main failures |
|---|---|---|
| Bennimarceau (extra, new products) | **100%** | none |
| Workout For Less | 95% | 1 text overlay |
| Bazta IE | 90% | text overlay |
| Bazta UK | 90% | text overlay |
| Converse PL | 65% | cropped 4, model visible 3 |
Not sampled: Aussui, MyBeauty.Boutique (not fashion), Caterboss (18 rows). Samples of 20 are about +-15 points; a real cutout run will lower it a bit.

## 6. Overlap with our catalogue (read-only SELECT)
- Offer URLs: **0** of our offers are on any feed host. No product-URL matches.
- Brand + title: our catalogue holds only 12 Adidas, 15 Nike, 9 New Balance, 2 Vans, 8 ASICS, 5 Crocs, 10 Ugg, 4 Salomon products, 0 Converse Chuck; at most ~10 could match by title. For practical purposes: no overlap, the feed would add new products. No EAN in our data, so no EAN match.

## 7. Fit for thin styles, and recommendation
Honestly: little. The feed is sneakers plus mainstream menswear (Tommy, Boss, Bugatti); no garments of niche style.
- **Retro Sport (men)**: Bennimarceau (Onitsuka Tiger, New Balance, adidas Originals Samba / Gazelle, ASICS) and Viaduct give real retro trainers; shoes only, the clothing around them must come from our shops.
- **Skater**: Vans 488 + Converse 1,106 shoes; shoes only.
- **Techwear**: only a few Salomon (80) shoes; weak.
- **Old Money / Quiet Luxury / Scandi**: Brian James Boss / Tommy Hilfiger polos, knits, chinos (about 1.7k tops, 1.3k bottoms) could help Old Money a little; no Quiet Luxury, Scandi, Boho, Punk, Grunge, Dark Academia.
It would mostly add shoes, which is not our gap (gaps are clothing in the thin styles).

| merchant | verdict |
|---|---|
| Bennimarceau | **Maybe / Import for shoes**: 13k sneakers, 100% usable, GBP, no discounts; only if more shoes help (Retro Sport, Skater) |
| Brian James | **Import** (as before): 8 brands, clothing, 486 on sale |
| Viaduct | **Maybe** (as before) |
| Converse PL | **Skip**: PLN, one brand, 65% usable, duplicates Bennimarceau Converse |
| Workout For Less | **Skip**: gym gloves and supports, not our style space |
| Bazta IE / UK | **Skip**: perfume plus watches / sunglasses, same range as Plusshop |
| Aussui, MyBeauty.Boutique, Caterboss | **Skip**: gift cards, perfume, 18 clogs |
| watch merchants, T.LUXY, Fashiontamers, Tooled Up, MoreThisWay | unchanged from `docs/architecture.md` "Affiliate feed" |

## 8. Selected brands (27 requested, 2026-10-22, read-only)
Re-downloaded the feed (same way, temp folder outside the repo, deleted afterwards), analysis script kept outside the repo. **All 27 brands are in the feed** (none missing; "Solomon" is spelled `Solomon` in the feed = Salomon; no plain "Hugo" rows). Merged: Boss+Hugo Boss, adidas+adidas Originals, Calvin Klein+Jeans, Tommy Hilfiger+Tommy Jeans. Image check (top 8 brands, 15 each, `probe-awin-usable.ts`): **actual AI cost $0.028** (cap 0.35). Samples of 15 are about +-20 points. Brian James lists every product twice (EUR + GBP), so its real count is half of the rows.

| brand (merged) | rows | main merchants | cur | stock | discount | link | categories (shoes/tops/bottoms/outer/acc) | usable img |
|---|---|---|---|---|---|---|---|---|
| Nike | 8,488 | Bennimarceau 8,295 | GBP | 100% | 0% | 100% | 95/1/0/1/0 | 93% |
| adidas (+Originals) | 3,174 | Bennimarceau 1,640, Viaduct 972, Workout For Less 206 | GBP | 100% | 37% | 100% | 55/14/10/3/5 (12% other) | 80% |
| Tommy Hilfiger (+Jeans) | 2,429 | Brian James 2,068, watch shops ~230 | EUR/GBP | 97% | 8% | 100% | 6/41/30/7/13 | 73% |
| Boss (+Hugo Boss) | 1,685 | Brian James 902, Watch Enclave 321, Watches of USA 168 | EUR/GBP/USD | 87% | 21% | 100% | 5/32/12/3/32 (17% other) | 67% |
| New Balance | 1,624 | Bennimarceau 1,458, Viaduct 166 | GBP | 100% | 10% | 100% | 86/9/4/2/0 | 93% |
| Converse | 1,106 | Converse PL 554 (PLN), Bennimarceau 534 | PLN/GBP | 100% | 0% | 100% | 80/4/2/2/0 | 93% |
| Bugatti | 1,050 | Brian James | EUR/GBP | 99% | 12% | 100% | 44/9/34/13/0 | 93% |
| Vans | 488 | Bennimarceau 464 | GBP | 100% | 2% | 100% | 92 shoes | 100% |
| Calvin Klein (+Jeans) | 402 | perfume / Bazta / Plusshop, Brian James 74 | mixed | 99% | 17% | 100% | 61% other (perfume), 17 acc | not sampled |
| Puma | 304 | Bennimarceau 148, Tooled Up 138 | GBP | 100% | 46% | 100% | 82 shoes, 11 outer | not sampled |
| Diesel | 250 | watch shops (76% watches) | GBP/USD | 85% | 60% | 100% | 76 acc | not sampled (img 81%) |
| Onitsuka Tiger | 237 | Bennimarceau | GBP | 100% | 0% | 100% | 100 shoes | not sampled |
| ASICS | 232 | Bennimarceau 220 | GBP | 100% | 0% | 100% | 95 shoes | not sampled |
| Dsquared2 | 215 | Fashiontamers 113, T.LUXY 92 | USD/EUR | 100% | 0% | 100% | clothing | not sampled (only 47% have an image) |
| Givenchy | 131 | perfume 70, T.LUXY 37, Fashiontamers 24 | mixed | 100% | 0% | 100% | 53% other | not sampled (82% image) |
| Dickies | 98 | Tooled Up | GBP | 100% | **100%** | 100% | 51 bottoms, 33 tops, 12 outer | not sampled |
| Brooks | 95 | Bennimarceau | GBP | 100% | 0% | 100% | 100 shoes (running) | not sampled |
| Crocs | 95 | Bennimarceau 56, others | GBP/EUR | 100% | 1% | 100% | 78 shoes | not sampled |
| Ugg | 81 | Bennimarceau | GBP | 100% | 0% | 100% | 100 shoes | not sampled |
| Salomon | 80 | Bennimarceau | GBP | 100% | 0% | 100% | 100 shoes | not sampled |
| The North Face | 65 | Bennimarceau 52 | GBP | 100% | 0% | 100% | 82 outerwear | not sampled |
| Under Armour | 64 | Viaduct 23, MoreThisWay 24 | GBP | 100% | 73% | 100% | 36 bottoms, 30 tops | not sampled |
| Helly Hansen | 62 | Brian James | EUR/GBP | 100% | 0% | 100% | 81 outer, 19 tops | not sampled |
| Armani Exchange | 59 | Fashiontamers 47 | USD | 100% | 0% | 100% | mixed | not sampled (only 20% have an image) |
| Superdry | 43 | Brian James 40 | EUR/GBP | 100% | 42% | 100% | 74 tops | not sampled |

**Failures seen:** Tommy 4 of 15 model photos, Boss 4 multi-item (set shots) + 1 cropped, adidas 2 model, rest single cropped. Nike/NB/Converse/Bugatti/Vans are clean product photos.

**Already in our `products`:** nike 15, adidas 12, ugg 10, new balance 9, asics 8, crocs 5, salomon 4, vans 2 (65 in total, 0 of the other brands). Earlier check: no URL overlap, so almost all feed products are new.

**Recommendation and cap for a first import** (cap = products per brand, in-stock + image only, random but spread over categories; shoes are not our gap, clothing is):
| brand | verdict | first cap |
|---|---|---|
| Tommy Hilfiger (+Jeans) | **Import** (Brian James clothing, 73% usable) | 400 |
| Boss (+Hugo Boss) | **Import**, only Brian James clothing, skip watches/perfume; set shots lower the yield | 300 |
| Bugatti | **Import** (clothing 56%, 93% usable) | 250 |
| Helly Hansen | **Import** (all, outerwear) | 31 |
| Dickies | **Import** (workwear, all on sale; check images first) | 98 |
| Superdry | **Maybe** (small, tops) | 40 |
| Under Armour | **Maybe** (sport clothing, on sale) | 40 |
| The North Face | **Maybe** (outerwear, Techwear/Outdoor) | 52 |
| Calvin Klein (+Jeans) | **Maybe**, Brian James clothing only (about 37 products) | 37 |
| adidas (+Originals) | **Maybe**: Viaduct clothing (972 rows) plus Samba/Gazelle; skip the 1.6k Bennimarceau sneaker mass | 200 (clothing) + 60 shoes |
| New Balance | **Maybe**: shoes (Retro Sport) | 80 |
| Onitsuka Tiger, ASICS | **Maybe**: retro trainers for Retro Sport | 40 each |
| Vans | **Maybe**: Skater shoes, 100% usable | 60 |
| Converse | **Maybe**: only the Bennimarceau rows (GBP), never Converse PL (PLN, 65% usable, duplicates) | 40 |
| Salomon | **Maybe** (Techwear, 80 shoes) | 40 |
| Nike | **Skip** for now: 8.3k near-identical sneaker rows; if wanted, cap | 100 |
| Puma | **Skip** (sneakers, some Tooled Up gear) | 0 |
| Brooks, Crocs, Ugg | **Skip** (running shoes, clogs, boots; Ugg/Crocs we already have) | 0 |
| Diesel, Givenchy | **Skip** (watches / perfume, 47-82% images) | 0 |
| Dsquared2, Armani Exchange | **Skip** (Fashiontamers images missing or 20-47%) | 0 |

Sum of the Import rows is about 1.1k clothing products; with all Maybes about 1.7k. Image risk: Tommy and Boss need the real cutout gate, expect 60-70% to survive.

## 9. Import (2026-10-22/23, branch `claude/awin-brands-feed-import-9miby3`)
Script `scripts/awin-select.ts` (downloads the feed from `AWIN_FEED_URL_BRANDS` into a temp folder outside the repo, picks products, writes `selection.json` + `links.json`), adapter `src/ingest/adapters/awin.ts` (reads the selection via `AWIN_SELECTION_FILE`, one `SOURCES` entry per merchant), `scripts/awin-links.ts` (stores links). Then the normal pipeline (preselect, classify, classify-accessories, bbox, cutout + image-check rounds, measure, pool, alternatives old + w2, catalogue). Temp files deleted afterwards, session token expired.
**Why fewer than the caps:** the feed has one row per SIZE (Brian James) or per variant (Tooled Up). Distinct products (page, in stock, GBP only, no shoes / socks / underwear / overalls / hi-vis, at most 2 colours per product, spread round-robin over tops / bottoms / outerwear / accessories): Tommy+Tommy Jeans 244 of cap 400, Boss 134 of 300, Bugatti 75 of 250, Helly Hansen 12 of 31, Dickies 18 of 98. Nothing was lowered for quality.
| shop | currency / market | products | feed_ready | usable (ready + measured) | status |
|---|---|---|---|---|---|
| brianjames | GBP / GB | 465 | 412 (89%) | 339 (73%) | active |
| tooledup (Dickies only) | GBP / GB | 18 | 13 (72%) | 10 (56%) | active (gate 50%) |
Dickies prices: all are on sale in the feed (standing "was" price), so no compare-at is stored (`trustRrp: false`); Brian James keeps rrp > price as compare-at. Gender: men (one Dickies women's tee).
**Affiliate links:** table `affiliate_links` (PK product_id + network + merchant; RLS on, no policy, no grants), filled through rpc `affiliate_links_upsert` (allowlisted for the gateway only): 482 rows. `aw_deep_link` is not in the raw payload either; used nowhere in the UI.
**Stock refresh:** `refreshShop` returns `skipped` ("awin feed shop: no daily stock refresh yet") for kind `awin`, so `shop_refresh_log` shows both shops every run; offers stay as imported until a feed-based refresh exists (needs the feed URL in the runner and a diff job; not done).
**Pool:** active outfits men 3,173 -> 3,388, women 4,369 -> 4,360 (rebuild reshuffles; the new menswear only affects men). 520 active pool outfits use a new top or bottom. Alternatives (old + w2), accessories and the catalogue snapshot rebuilt (8,781 pieces).
**Cost:** AI $0.68 (classification $0.54, accessory classification $0.03, image checks about $0.11); `dash_ai_spend` 28.15 -> 28.83. Skipped on purpose: shoes, watches (watch shops), perfume, Fashiontamers (no images), Aussui (mixed currencies), Calvin Klein, adidas, Nike etc.
**Fix on the way:** `scripts/probe-awin.ts` had a type error that broke `npm run build` (its commit was docs-only with [skip ci], so it was never built).
