# Nike + adidas in the two Awin feeds (counted 2026-10-27, Prompt 66)

Read-only count. Brand = Nike, or adidas incl. adidas Originals / Performance. Both feeds were merged first (the older feed is a subset of the brands feed for Bennimarceau, Viaduct and Fashiontamers; overlap rows counted once). "Pages" = distinct product pages (a page is one colourway, sizes are separate rows). No URLs, no keys here.

| Retailer (currency) | Brand | Rows | With image | In stock | Pages (in stock, image, link) | Already imported | Excluded by Prompt 57 rules | Colour-variant duplicates |
|---|---|---|---|---|---|---|---|---|
| Bennimarceau (GBP) | Nike | 8,295 | 8,280 | 8,295 | 601 | 555 | 46 not footwear (jackets, hoodies, sweatshirts, tees, pants) | 0 |
| Bennimarceau (GBP) | adidas | 1,640 | 1,640 | 1,640 | 135 | 113 | 21 not footwear, 1 kids | 0 |
| Viaduct Clothing (GBP) | adidas | 947 | 947 | 947 | 688 | 0 | not a Bennimarceau row, count only | 0 |
| Viaduct Clothing (GBP) | Nike | 15 | 15 | 15 | 13 | 0 | count only | 0 |
| Workout For Less (GBP) | adidas | 205 | 205 | 205 | 82 | 0 | count only | 0 |
| Aussui (mixed, 12 currencies) | Nike + adidas | 307 | 307 | 307 | 307 | 0 | count only (mixed currencies) | 0 |
| Plusshop UK/IE, Bazta UK/IE | adidas | 204 | 204 | 204 | 96 | 0 | count only | 0 |
| MyBeauty.Boutique, MoreThisWay | Nike + adidas | 17 | 17 | 17 | 17 | 0 | count only | 0 |
| Fashiontamers US (USD) | adidas | 5 | 0 | 5 | 0 | 0 | no images | 0 |

Rules applied to Bennimarceau (from Prompt 57): in stock, valid tracking link and image, GBP, footwear category only (trainers, boots, sandals, slippers), no kids, one product per page, colour left empty so colourways never merge. Colour-variant duplicates: with an empty colour the canonical key is per page (`unmerged|source|id`), so the merge rule produces 0 duplicates; no two eligible pages share an image either.

**Result:** of 736 Bennimarceau pages, 668 are imported (all footwear). Remaining under the Prompt 57 rules: **0**. The other 67 pages are clothing (Nike 46, adidas 21; mostly jackets), left out only because the rule is "footwear only". Importing them would need a rule change (decision open).
