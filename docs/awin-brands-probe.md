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
