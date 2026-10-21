// One config file for the dynamic composer: mix shares, limits, thresholds. Everything tunable lives here.
export const COMPOSE = {
  minScore: 0.84,                 // same minimum as the pool builder (src/outfits/pool-shared.ts MIN_SCORE_DEFAULT)
  contrastMinScore: 0.80,         // deliberate style breaks start from a lower style similarity, so their own minimum
  /** share of outfits per bucket; the bucket is drawn per outfit */
  mix: { match: 0.45, near: 0.30, new: 0.20, contrast: 0.05 },
  guestMix: { match: 0, near: 0, new: 0.95, contrast: 0.05 },   // guests: neutral profile, default rules, about 5% deliberate breaks
  /** taste percentile bands of a slot's candidates: match = top share, near = next, new = the rest */
  bands: { match: 0.15, near: 0.5 },
  bandWeightOutside: 0.04,        // weight of candidates outside the wanted band (keeps the feed from going empty, adds surprise)
  anchorSlot: { top: 0.42, bottom: 0.28, shoes: 0.10 },   // full-body weight = share of full-body pieces in the gender's catalogue (x anchorFullBoost)
  anchorFullBoost: 1.0,
  topN: 12,                       // weighted sampling among the best N completions of a slot
  scoreExponent: 6,               // base score ^ this as sampling weight (same sharpness as the pool's weighted shuffle)
  tasteWeight: 0.8,               // weight x (1 - tasteWeight + tasteWeight x tasteMatch)
  connectionWeight: 1.0,          // weight x (1 + connectionWeight x connectionBonus)
  pairK: 10,                      // best partners per anchor before the last slot is chosen (same as the pool's K_PAIR)
  partnerSample: 160,             // partners looked at per slot (random sample, taste-weighted) - bounds the work per outfit
  shoeSample: 140,
  attempts: 10,                   // retries per outfit when the score / validators fail
  seasonWeightCurrent: 0.4,       // target season of an outfit: the current season gets this share, the other three share the rest
  freshnessPerUse: 0.6,           // weight / (1 + freshnessPerUse x uses in this session)
  session: { products: 12, styles: 3, stores: 2 },        // no repeats in a row (StreakGuard, same numbers as the pool ordering)
  accessories: true,
  ban: {
    fraction: 0.25,               // at most this share of a group (slot / accessory type) is banned at the same time ...
    overall: 300,                 // ... and at most this many ids are remembered per device (300 ids = 1.2 KB; it is fine if a product shows up twice)
    minPool: 12,                  // soft fallback: if fewer allowed candidates are left, the oldest bans are released first
    minPoolAcc: 4,
  },
  likesBanned: true,              // liked pieces are treated like other served pieces for now (set false to let liked pieces return in new combinations)
  starter: { perGender: 60, contrastShare: 0.05, minScore: 0.9 },
} as const;
export type Bucket = "match" | "near" | "new" | "contrast";
