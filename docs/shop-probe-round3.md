# Shop probe round 3: "hype" streetwear candidates (2026-11-08, Prompt 87)

PROBE ONLY. No import, no database write, no AI call, no spend. Tools: the repo's polite HTTP client (`src/ingest/http.ts`: DrapeBot user agent, robots.txt, 1.5 s per host, skips 401/403/404/429/503) and `/products.json` (up to 6 pages of 250, so "1500+" means the probe stopped). Catalogue check by read-only SQL on `sources` / `offers` (no token needed). Images: 12 random products per shop (fixed seed), first image, judged by eye on a contact sheet ("clean" = packshot, flat lay, ghost mannequin, plain background). Currency from `/meta.json`. Gender, category and style columns are keyword guesses from product type / tags / title (style = guess, not classified). Shipping markets are not visible in `products.json`; the market must still be set per shop in `shop_market` (runner sits in Dublin). Prices are in the shop currency, major units, cheapest in-stock variant.

## Table

| shop (domain) | status | live / total | clean | image px | cur | price min / med / max | gender (guess) | categories (top / bottom / shoes / acc) | likely styles (guess) | verdict, cap |
|---|---|---|---|---|---|---|---|---|---|---|
| Prohibited (www.prohibited.shop) | ok, Shopify | 820 / 829 | 12/12 | 1400x1750 | EUR | 23 / 91 / 455 | men 94% | 576 / 158 / 0 / 80 | streetwear, skater, minimalism, preppy | **ok, cap 170** (domain is .shop; prohibited.co answers 503) |
| HoMie (homie.com.au) | ok | 218 / 412 | 10/12 | 2363x3544 | AUD | 5 / 46 / 133 | no tags (mostly unisex) | 140 / 28 / 0 / 38 | streetwear, skater, athleisure | **ok, cap 130**; half the catalogue is out of stock |
| Western Aloha (westernaloha.com) | ok | 92 / 92 | 12/12 | 2048x2048 | USD | 29 / 54 / 148 | men 78%, some women | 56 / 26 / 1 / 8 | resort, western, vintage (aloha shirts) | **ok, cap 80** (take almost all) |
| Bolzr (bolzr.store) | ok | 56 / 78 | 11/12 | 1254x1254 | EUR | 12 / 33 / 79 | men | 36 / 6 / 0 / 2 (12 other) | streetwear, athleisure, minimalism | **ok, cap 50**; tiny, all on sale |
| Blackcraft Cult (blackcraftcult.com) | ok | 75 / 99 | 9/12 | 1200x1200 | USD | 10 / 65 / 125 | unisex 57% | 32 / 22 / 0 / 19 | punk_edgy, grunge | **ok, cap 60** (all there is) |
| Spiral Direct (spiraldirect.com) | ok | 1499 / 1500+ | 12/12 | 1000x1000 | GBP | 8 / 18 / 63 | men 77%, unisex | 1349 / 139 / 6 / 0 | grunge, punk_edgy, vintage | **ok, cap 110**; 90% band tees (licensed merch, "Rock Off" vendor), take bottoms/hoodies first, one tee per band |
| Trendt Vision (trendtvision.com) | ok | 106 / 440 | 7/12 | 1280x1920 | EUR | 25 / 120 / 315 | no tags | 56 / 29 / 7 / 10 | streetwear, y2k, grunge (baggy) | **maybe, cap 80**; only a quarter in stock; ~40% model photos |
| Lonely Kids Club (lonelykidsclub.com) | ok | 1483 / 1500+ | 11/12 | 2048x2048 | AUD | 6 / 49 / 104 | no tags (kids lines exist) | 1238 / 12 / 10 / 169 | skater, grunge, vintage graphic tees | **maybe, cap 110**; 74% printed tees, skip "Kids" type |
| Stockholm Surfboard Club (www.stockholmsurfboardclub.com) | ok (apex 404, www ok) | 100 / 113 | 7/12 | 1800x2250 | EUR | 90 / 300 / 2100 | mixed | 55 / 16 / 1 / 9 (19 other: boards, swim) | skater, resort, vintage | **maybe, cap 50**; very expensive, surfboards/swim to skip |
| Kimes Ranch (kimesranch.com) | ok | 649 / 652 | 3/12 | 2048x3072 | USD | 8.5 / 36 / 675 | men 30% / women 35% / unisex | 449 / 43 / 12 / 143 | western | **maybe, cap 120**; only the fills western gap, expect ~25% usable (caps and flat shirts are clean, rest model shots) |
| Fuga Studios (fuga-studios.com) | ok | 175 / 208 | 2/12 | 2245x3000 | EUR | 38 / 137 / 438 | unisex | 97 / 64 / 0 / 14 | techwear, punk_edgy, grunge | **maybe, trial cap 40**; mostly model shots, but the only techwear source |
| WRSTBHVR (worst-behavior.com) | ok | 792 / 840 | 0/12 | 2600x3250 | EUR | 40 / 120 / 350 | unisex | 571 / 114 / 0 / 54 | streetwear | skip: all model photos (grey studio) |
| Edikted (edikted.com) | ok | 1411 / 1500+ | 0/12 | 1200x1799 | USD | 3 / 26 / 130 | women | 831 / 325 / 3 / 158 | y2k, coquette | skip: all model photos (same as the 22 Oct probe) |
| Jaded London (www.jadedldn.com) | ok on www only; apex answers 403, so it was not used | 1185 / 1500+ | 2/12 | 2048x3071 | GBP | 8 / 65 / 300 | unisex 70% / men | 564 / 486 / 88 / 45 | grunge, y2k, punk_edgy | skip: model photos |
| Motel Rocks (motelrocks.com) | ok | 1106 / 1500+ | 1/12 | 800x1012 | GBP | 6 / 32 / 115 | women | 0* / 1050* / 8 / 48 | y2k, coquette, boho | skip: model photos, low resolution (*type keywords mislead: mostly tops and dresses) |
| Eclectico (eclectico.com.au) | ok | 777 / 862 | 4/12 | 1200x1200 | AUD | 8 / 44 / 449 | women 28% / men 7% / rest unknown | 202 / 126 / 0 / 307 | boho (silver jewellery, dresses) | skip for now: jewellery lifestyle shots, 40% accessories |
| Born in Stockholm (borninstockholm.com) | ok | 744 / 753 | 1/12 | 2000x3001 | SEK | 11 / 183 / 1019 | women | 224 / 89 / 6 / 121 | resort, boho (festival) | skip: festival model shots (as on 22 Oct) |
| Disturbia (disturbia.co.uk) | **in catalogue** `disturbia` | 110 products | 0 feed-ready | | | | | | | already in catalogue, not re-probed |
| Butter Goods (buttergoods.com) | **in catalogue** `buttergoods` | 100 products | 100 feed-ready | | | | | | | already in catalogue |
| Rockmount (rockmount.com) | **in catalogue** `rockmount` | 90 products | 6 feed-ready | | | | | | | already in catalogue (flagged quality) |
| Rowing Blazers (rowingblazers.com) | **in catalogue** `rowingblazers` | 110 products | 20 feed-ready | | | | | | | already in catalogue (flagged quality) |
| Geedup (geedupclothing.com) | **blocked**: main store answers 401 (password page); only the `us.` subdomain answers | | | | | | | | | skip: no workaround |
| IRIEDAILY (iriedaily.de) | **blocked**: robots.txt disallows `/products.json` | | | | | | | | | skip |
| We11done (we11done.com) | **blocked/unreachable**: 503 | | | | | | | | | skip |
| UMTC (umtc.com) | **unreachable**: 503; real domain not verified | | | | | | | | | skip |
| Double Rainbouu (doublerainbouu.com) | Shopify, but `products.json` is empty ("having a holiday") | 0 | | | | | | | | skip, retry later |
| Wood Wood (woodwood.com) | no public `products.json` (404) | | | | | | | | | skip |
| Punk Rave (punkrave.com), thisisneverthat (thisisneverthat.com), HoMie apex (homie.co) | not Shopify (HTML instead of JSON) / wrong domain | | | | | | | | | skip / dropped |

Skipped by instruction: Deputy Department, Succubus, Killstar, Tecovas, Ettika, Affliction (Killstar, Tecovas, Ettika, Affliction are already in the catalogue). Domain notes: Prohibited is `prohibited.shop`, Geedup is `geedupclothing.com`, HoMie is `homie.com.au`; Trendt Vision is `trendtvision.com`. "Clean" is a 12-image sample (+/- 25 points).

## Top 10 (ranked) with caps

Rank by clean-image share first, then stock, then fit with the thin styles.

| # | shop | live | clean | cap | what it fills |
|---|---|---|---|---|---|
| 1 | Prohibited | 820 | 12/12 | 170 | streetwear / skater / smart-casual men, plain flat packshots |
| 2 | HoMie | 218 | 10/12 | 130 | skater / streetwear, unisex basics |
| 3 | Western Aloha | 92 | 12/12 | 80 | western + resort (aloha and western shirts) |
| 4 | Bolzr | 56 | 11/12 | 50 | clean streetwear basics (ghost mannequin) |
| 5 | Blackcraft Cult | 75 | 9/12 | 60 | punk / grunge (thin styles) |
| 6 | Spiral Direct | 1499 | 12/12 | 110 | grunge / punk band tees (bottoms and hoodies first) |
| 7 | Trendt Vision | 106 | 7/12 | 80 | y2k / grunge baggy streetwear |
| 8 | Lonely Kids Club | 1483 | 11/12 | 110 | skater graphic tees (tees only, no kids) |
| 9 | Stockholm Surfboard Club | 100 | 7/12 | 50 | skater / resort / vintage |
| 10 | Kimes Ranch | 649 | 3/12 | 120 | western (thin style), low yield |
| 11 | Fuga Studios (trial) | 175 | 2/12 | 40 | techwear (only source found) |

Sum of caps: 170 + 130 + 80 + 50 + 60 + 110 + 80 + 110 + 50 + 120 + 40 = **1,000**. Expected usable after the image gates (clean share, rough): about 700 (Kimes and Fuga lose most of theirs; the others keep 60-95%).

Gaps: western (Western Aloha, Kimes), punk / grunge (Spiral, Blackcraft, Trendt), skater (HoMie, Lonely Kids, SSC, Prohibited), resort (Western Aloha, SSC) are covered. Techwear only through the weak Fuga trial. Coquette and boho (men's included) are NOT covered: every coquette/boho candidate (Edikted, Motel, Born in Stockholm, Eclectico) is model-photo based; a different source is needed.

## Import notes

- All ten need `sources.ts` lines (`shopify(...)`), a `shop_market` row (HoMie / Lonely Kids Club AU, Prohibited / Trendt Vision / SSC / Bolzr / Fuga DE-EUR, Spiral GB, Western Aloha / Blackcraft / Kimes US) and the normal recipe in CLAUDE.md ("New-shop recipe"). Use `inStockOnly` and `max` per shop = the caps above; tees-only shops (Spiral, Lonely Kids) need a per-design cap.
- **A token is needed for the import** (`DRAPE_PIPELINE_TOKEN` with the gateway actions for `ingest`, `classification_store` etc.; not in cloud sessions). Classification is paid (about $2.5 per 1,700 products last round, so roughly $1.5 for 1,000, under the $10 run cap). Only the final import needs it; this probe did not.
- Rights topics for Spiral (licensed band merch) stay in the postponed security/legal backlog.
- Re-probe Double Rainbouu later (empty store). Geedup stays locked unless its main store opens.
