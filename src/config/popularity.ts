// Brand popularity (brand_norm, per gender): constants for the score and the live-feed factor. Tune here, no migration needed.
// The SQL view dash_brand_popularity repeats these numbers (tests/brand-popularity.test.ts keeps both in sync; change the view too when you change them).
/** Weighted signal per brand and gender: likes x 1 + taps x 0.3 + outbound clicks x 2 - scroll-pasts x 0.005.
 *  A scroll-past is the default reaction to most outfits (about 55% of the shown pieces), so it only counts as a tiny penalty; 0.02 made the women's average negative on today's data. */
export const POPULARITY_WEIGHTS = { like: 1, tap: 0.3, click: 2, scrollPast: 0.005 } as const;
export const POPULARITY = {
  smoothingK: 200,        // shrink strength in impressions: smoothed = (signal + K x avg) / (impressions + K)
  minImpressions: 300,    // below this a brand stays neutral (factor 1.0)
  gain: 0.5,              // factor = 1 + gain x (smoothed rate / average rate - 1)
  factorMin: 0.85, factorMax: 1.30,
  staleHours: 72,         // the daily job runs at 01:45 UTC; data older than this counts as stale (all factors 1.0)
} as const;
/** Combined selection-weight multiplier of shop preference (Profile > Shops, SHOP_PREF) x brand factor. Only applied when a brand factor is active, so a shop level alone
 *  (0.4 / 2.6) is never touched. Neither a shop nor a brand can vanish (min) or dominate (max). */
export const COMBINED_MULT = { min: 0.35, max: 3.0 } as const;
/** App setting that switches the boost (default true) and the link parameter that turns it off for a comparison (?brand=0). */
export const BRAND_BOOST_SETTING = "brand_boost_enabled";
