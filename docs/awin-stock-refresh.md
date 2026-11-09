# Awin stock and price refresh (manual script)

Awin shops (`brianjames`, `tooledup`, `bennimarceau`, `viaduct`, `tluxy`) have no public product feed, so the daily Shopify refresh does not touch them (the runner only takes `kind = shopify`). `scripts/refresh-awin-stock.ts` refreshes them from the Awin feed files. Manual only: no pg_cron, no Vercel job.

## Run it (in a session)
Needs `AWIN_FEED_URL` and `AWIN_FEED_URL_BRANDS` (session environment only; never in Vercel, Supabase or the repo) and `DRAPE_PIPELINE_TOKEN` with rpc rights `awin_refresh`, `shop_market_list`, `shop_log_add` only (mint a 24 h token as in `docs/architecture.md`, expire it afterwards).

    npx tsx scripts/refresh-awin-stock.ts --dir <scratch dir outside the repo>            # dry run, counts only
    npx tsx scripts/refresh-awin-stock.ts --apply --dir <scratch dir outside the repo>    # writes

Options: `--shop <slug>` (repeatable), `--min-match 0.5`. Delete the scratch dir afterwards (feeds, no URLs inside). Run it about once a day or at least weekly while Awin shops are live; it is not scheduled.

## What it does
- Downloads both feeds, keys rows like the importer (`bj:<m-id>`, `tu:<product id>`, `bm:<page slug>`, `vc:` / `tl:<page slug>`), keeps only our merchant + currency rows. A page = many size rows: in stock when any row is, price of the cheapest in-stock row, compare-at = rrp only for shops with `trustRrp`.
- Database function `awin_refresh(slug, mode, items)` (mode ids | plan | apply, UPDATE only) then calls the existing `offers_refresh`: price, compare-at and availability are updated, offers missing from the feed go `out_of_stock` (delisted), offers back in the feed return to `in_stock`. Nothing is deleted; collapsed variants stay out (they were never rows). Currency stays as imported. `products.feed_ready` is not touched (same as the Shopify refresh: the composer only uses pieces with an in-stock offer).
- Price guard per product: a new price more than 30% away from the stored one is rejected (old price kept, stock still applied) and counted as `price_rejected`; if more than 30% of a shop's offers would be rejected nothing is applied for that shop. Frozen shops (`shop_market.frozen`) are skipped. If a shop finds fewer than `--min-match` of its offers in the feeds, it is refused (partial feed protection). A failed feed download stops the whole run.
- Writes one `shop_refresh_log` row per shop ("refreshed by script on <date>, manual"), so the dashboard shows a real time and count instead of "skipped".

## Cannot do
- No cut-outs or classification for changed images (reported as `image_changed` only); no new products (use `awin-select` + ingest); `affiliate_links.feed_price` / `feed_in_stock` are not updated (the offer is the source of truth); no automatic runs; the composer snapshot is not rebuilt here (the next daily snapshot picks the change up).
- Note: the feed's GBP prices follow an EUR conversion, so nearly every Brian James price moves a little (about 0.5%) on each run. That is normal, which is why the guard looks at the size of one change, not at how many change.

## First run (2026-11-09)
brianjames: 434 matched, 434 prices changed, 31 not in the feed (out of stock), 1 sold out, 72 compare-at changes. tooledup: 18 matched, 1 price. bennimarceau: 664 matched, 4 not in the feed (out of stock), 1 price rejected (>30%). viaduct, tluxy: 500 matched each, no change (viaduct 1 image URL changed).
