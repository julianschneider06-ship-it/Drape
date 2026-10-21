// Personalization (step 4): ONE config file for the signal weights, decay, thresholds and feed mix shares. Everything tunable lives here.
// The taste model itself is src/outfits/taste.ts (pure functions, shared by the server page path, the simulation and the replay job).

/** How much one event moves the taste. Positive = "more of this", negative = weak "less of this". There is NO dislike button:
 *  the only explicit negative is outfit_down (outfit level); swapping a piece away and scrolling past are weak implicit signals. */
export const SIGNAL = {
  like: 1.0,                  // product like: strong + on that product's style / attributes; its outfit's combination gets likeConnection x this
  likeConnection: 0.6,
  unlike: -1.0,               // reverts a like (same size, opposite sign)
  view_product_click: 0.8,    // opened the shop page: strong +
  tap_product: 0.4,           // opened the product sheet: medium +
  dwellMax: 0.3,              // dwell: weak +, grows with time from dwellMinMs to dwellFullMs, capped
  dwellMinMs: 3000, dwellFullMs: 10000,
  scroll_past: -0.15,         // left within a second without touching: quick, weak - on every piece
  outfit_up: 0.6,             // chevrons up: medium + on EVERY product of the outfit, plus its combination
  outfit_up_connection: 0.8,
  outfit_down: -0.35,         // chevrons down: medium - per product, smaller than outfit_up per product (one disliked piece should not kill the others)
  outfit_down_connection: -0.6,
  swapOut: -0.25,             // swiping a piece away: weak - on THAT product's attributes only (not the outfit)
  swapIn: 0.1,                // the piece swiped in (shown) gets a tiny +
  swapBack: 0.2,              // going back to the original: the original was preferred
  keep: 0.15,                 // the piece on screen when the user leaves a swapped outfit counts as kept; x keepBoost with like / tap / long dwell
  keepBoost: 2,
  tagScale: 0.5,              // outfit-level events also move the tag preferences (season, occasion, palette, silhouette, formality, weather, contrast) by this x the event weight
};

export const TASTE = {
  decay: 0.995,               // per event: older behaviour fades (half-life about 140 events)
  connectionDecay: 0.999,
  personalizeFrom: 20,        // events before the composer personalizes (below: starter set, then neutral composer)
  maxCategories: 40,          // colours / categories / silhouettes kept per device (smallest weights dropped)
  outboxMax: 80,              // signals the client keeps until the next page request
  thinSupply: 15,             // a taste style with fewer pieces (per slot and gender) counts as thin: the composer uses the nearest styles and reports it
};

/** Feed mix for a personalized device (>= personalizeFrom events): bucket per outfit. "new" is the always-on exploration share (valid, compatible
 *  outfits outside the taste bands); contrast = deliberate style breaks (own scoring, see src/outfits/compose-polish.ts). */
export const MIX = {
  personal: { match: 0.47, near: 0.28, new: 0.20, contrast: 0.05 },
  neutral: { match: 0, near: 0, new: 0.95, contrast: 0.05 },      // new devices after the starter set: default rules, about 5% breaks
  minExploration: 0.18,      // the "new" share never goes below this (guard in mixFor)
};

/** How strongly the taste steers the composer (multipliers on the sampling weights). */
export const STEER = {
  styleVsAttributes: 0.75,   // taste match of a piece = 0.75 x style cosine + 0.25 x attribute match (colour, category, silhouette, formality, boldness)
  tagWeight: 0.35,           // final pick weight x (1 + tagWeight x tag match -1..1)
  connectionWeight: 1.0,     // x (1 + connectionWeight x connection bonus -1..1)
};

export function mixFor(n: number): Record<"match" | "near" | "new" | "contrast", number> {
  if (n < TASTE.personalizeFrom) return MIX.neutral;
  const m = { ...MIX.personal }; if (m.new < MIX.minExploration) { const d = MIX.minExploration - m.new; m.new = MIX.minExploration; m.match = Math.max(0, m.match - d); }
  return m;
}
