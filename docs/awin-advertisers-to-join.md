# Awin advertisers to join (Prompt 89, 2026-11-09, read-only)

Both feeds were downloaded once to a scratch folder OUTSIDE the repo (URLs only from env, never printed or stored; files deleted afterwards) because the older docs had no merchant ids, page counts or gender split. Nothing imported, no database write, no AI spend. Method: both feeds merged and de-duplicated on merchant id + `aw_product_id` (44.5k rows, **22 advertisers**; the first feed alone is a subset for most of them). Rows in one currency only (Brian James lists each product twice, EUR + GBP). **Distinct products = distinct product pages in stock** (colour and size variants collapsed; one page = one colourway). Category and gender are guessed from category text and product names (accuracy about +-10 points; the feeds have no gender column). "Ships-to" is NOT a feed field; it is inferred from currency / advertiser name.

**Main finding:** the feeds hold only these 22 advertisers, and **every brand on the Maybe / Skip list is sold by one of them** (table 2). So the join list is these advertisers, not new ones; only 12 sell any clothing at all. Clothing is thin: the best clothing catalogues are Brian James (979), Luregod (796, angling brands, not fashion), Fashiontamers (759, but no images), T.LUXY (721) and Viaduct (712).

## 1. Advertisers (ranked by distinct in-stock clothing products)
Awin search = the advertiser name exactly as in the feed (the programme name in "Join Programmes" can differ slightly; if no hit, search the first word, e.g. "Bennimarceau", "Emensuits").

| # | Advertiser (feed spelling = Awin search) | Merchant id | Brands sold (rows) | Feed rows | Distinct products (in stock) | Clothing products | Main categories | M / W / unisex | Cur | Market (inferred) | Clothing share of rows | Joined? | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Brian James | 86775 | Tommy Hilfiger 897, Bugatti 499, Tommy Jeans 448, Boss 419, Remus Uomo 311, Farah 280, Gant 265, Helly Hansen, Superdry, Calvin Klein | 7,103 (3,544 GBP) | 1,122 | **979** | clothing, some shoes/accessories | 98 / 0 / 2 | GBP + EUR | GB (EU via EUR) | 87% | **Joined** (imported, 465 products) | menswear only; set shots lower yield |
| 2 | Luregod (DE) | 129661 | FOX 635, Westin 308, Matrix 100 | 1,043 | 811 | **796** | clothing (angling wear: sweaters, pants, tees, jackets) | 0 / 4 / 96 | EUR | DE | 98% | unknown | **Not fashion** (fishing brands); 22% out of stock earlier |
| 3 | Fashiontamers US | 117403 | Colmar 124, Dsquared2 113, pinko 108, Lacoste 101, Michael Kors 80, Voile blanche 75, Mykita 71, Armani Exchange | 1,626 | 1,626 | **759** | accessories 36% (sunglasses), clothing 47%, shoes 17% | 40 / 60 / 0 | USD | US | 47% | unknown | **No images** (`merchant_image_url` empty for all rows): unusable until fixed |
| 4 | T.LUXY | 74768 | Dsquared2 92, Dolce & Gabbana 92, Balmain 76, Bottega Veneta 74, Valentino 73, Balenciaga 66, Brunello Cucinelli 64, Givenchy | 1,180 | 813 | **721** | clothing (bags 58) | mixed (unisex tag) | EUR | EU | 92% | unknown | luxury, high prices; images fine |
| 5 | Viaduct Clothing | 125096 | adidas Originals 600, Adidas 243, New Balance 161, Champion 61, Ellesse 33, Under Armour 19, Nike 19 | 1,143 | 838 | **712** | clothing 85%, shoes 13% | 13 / 29 / 58 | GBP | GB | 85% | unknown | category text is only "General Clothing"; real discounts on nearly all rows |
| 6 | Tooled Up | 496 | Portwest 7,396, Dewalt 720, Apache 554, Caterpillar 480, Skechers 376, Milwaukee 330, Snickers 270, Dickies | 11,053 | 473 | **209** | workwear clothing 53%, shoes 38% (work boots) | 93 / 6 / 0 | GBP | GB | 53% | imported (Dickies, 18); **join unconfirmed** | tools and PPE dominate; workwear only |
| 7 | Bennimarceau.com | 128713 | Nike 8,450, Adidas 1,652, New Balance 1,506, Converse 534, Vans 464, Onitsuka Tiger 237, ASICS 220, Puma, Brooks, Salomon, Ugg, The North Face | 13,646 | 1,054 | **131** | **shoes 96% of rows** | no gender column (unisex) | GBP | GB | 4% | imported (668 shoes); **join unconfirmed** | mostly shoes; 67 Nike/adidas clothing pages left out by rule |
| 8 | MoreThisWay | 129549 | WWE 104, Under Armour 24, Vans 10, Disney 6, Nike 5 | 154 | 154 | **105** | tees, hats | 78 / 10 / 12 | GBP | GB | 68% | unknown | **tiny catalogue**, merch tees |
| 9 | Emensuits Affiliate Program US | 102431 | Bravo 1,558, Vinci 721, Perry Ellis 120 | 2,399 | 120 | **68** | suits and shoes | 100 / 0 / 0 | USD | US | 35% | unknown | formal menswear, small distinct count |
| 10 | Converse PL | 21652 | Converse 500 | 500 | 500 | **54** | **shoes 68%**, other 21% | unisex | PLN | PL | 11% | unknown | mostly shoes; PLN; duplicates Bennimarceau Converse |
| 11 | Body Body | 125338 | Leg Avenue 35 | 35 | 23 | **15** | dresses, swimwear | 0 / 61 / 39 | USD | US | 65% | unknown | **tiny catalogue**, lingerie style |
| 12 | Workout For Less | 25564 | Adidas 201 | 201 | 82 | **1** | gym gloves, mats, supports | unisex | GBP | GB | 0% | unknown | not fashion |
| 13-15 | (no more advertisers with clothing) | | | | | 0 | | | | | | | the remaining 10 sell no clothing, see table 3 |

Top 15 = only 12 advertisers can be ranked; ranks 13-15 do not exist because the other 10 advertisers have 0 clothing products.

## 2. Maybe / Skip brands -> which advertiser sells them
| Brand | Advertiser(s) to join | Note |
|---|---|---|
| Superdry, Calvin Klein (+Jeans), Helly Hansen, Tommy, Boss, Bugatti | Brian James (already joined) | Calvin Klein also in perfume shops (not clothing) |
| adidas / adidas Originals | Viaduct Clothing (clothing), Bennimarceau (shoes), Workout For Less (gym, skip) | |
| Under Armour | Viaduct Clothing 19, MoreThisWay 24 | both small |
| New Balance | Viaduct 161, Bennimarceau (shoes) | |
| The North Face, Salomon, ASICS, Onitsuka Tiger, Brooks, Ugg, Vans, Converse, Nike, Puma, Crocs | Bennimarceau (all shoes, plus a few TNF jackets) | Converse also Converse PL; Crocs/Puma also Caterboss (18 rows); Puma also Tooled Up (gear); Nike/adidas also Aussui (gift cards) |
| Dsquared2, Armani Exchange | Fashiontamers US (no images), T.LUXY (Dsquared2) | |
| Givenchy, Diesel | Watch / perfume shops, T.LUXY (Givenchy 37) | perfume and watches |

So joining new advertisers is not needed for any listed brand; the only open join decisions are Viaduct, T.LUXY and (if wanted) Fashiontamers once it supplies images.

## 3. The other 10 advertisers (no clothing)
| Advertiser (feed spelling) | Merchant id | Brands | Feed rows | Distinct products | Category | Cur / market | Joined? | Flag |
|---|---|---|---|---|---|---|---|---|
| WATCH & WATCH | 78380 | Emporio Armani 279, Michael Kors 239, Gucci 165, Diesel, Burberry | 1,037 | 925 | watches 100% | GBP / GB | unknown | accessories only |
| Watches Of USA | 116479 | Emporio Armani 199, Hugo Boss 168, Michael Kors, Gucci | 915 | 914 | watches 100% | USD / US | unknown | accessories only |
| Watch Enclave | 122382 | Hugo Boss 321, Emporio Armani 245, Tommy 103, Tissot | 927 | 332 in stock | watches 100% | GBP / GB | unknown | 64% out of stock |
| Plusshop IE | 29511 | Calvin Klein 56, Adidas 49, Hugo Boss 44, Casio 36 | 231 | 102 | watches, perfume | EUR / IE | unknown | tiny, same range as Bazta |
| Plusshop UK | 69306 | same | 209 | 95 | watches, perfume | GBP / GB | unknown | tiny |
| Bazta IE | 116033 | Calvin Klein 56, Adidas 49, Hugo Boss 44 | 152 | 67 | perfume, personal care | EUR / IE | unknown | not fashion |
| Bazta UK | 116097 | same | 142 | 64 | perfume, personal care | GBP / GB | unknown | not fashion |
| MyBeauty.Boutique | 106925 | Calvin Klein 84, Hugo Boss 83, Givenchy 70 | 307 | 306 | perfume / cosmetics | GBP / GB | unknown | not fashion |
| Caterboss | 71121 | Crocs 17, Puma 1 | 18 | 11 | shoes 100% | EUR / EU | unknown | tiny, shoes |
| Aussui Affiliate Programme (UK) | 127361 | Nike 116, Adidas 69 | 475 (185 in stock) | 185 | gift cards | 16 currencies | unknown | not fashion |

## 4. Reading the table
- **Join status:** only Brian James is confirmed joined. Awin product feeds usually list only programmes the account is joined to, so the others may already be joined; the feed cannot say. Check in the Awin account (Advertisers > My Programmes) before applying.
- **Mostly shoes:** Bennimarceau (96%), Converse PL (68%), Caterboss (100%), Tooled Up (38%).
- **Mostly model photos:** not measured per advertiser in this pass (no image run); earlier 15-20 image samples: Tommy 4/15 and Boss 5/15 model or set shots (Brian James), Converse PL 3/20 model, others clean. Fashiontamers has no image at all.
- **Tiny catalogues (< 200 distinct):** MoreThisWay, Body Body, Caterboss, Emensuits (120), Workout For Less, Plusshop, Bazta.
- **Image field:** every advertiser except Fashiontamers has `merchant_image_url` on 100% of in-stock rows.
- **Recommendation:** nothing new needs joining for the listed brands; if clothing volume is wanted, join **Viaduct** (712, women + men, adidas Originals / New Balance / Champion / Ellesse) and **T.LUXY** (721, luxury) first; Luregod only if angling wear is wanted (it is not fashion).
