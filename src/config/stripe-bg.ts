// "Ribbed glass" background of the For You feed: a soft colour gradient (colours come from the outfit in view) under fine vertical stripes.
// CSS only: layered gradients + a repeating stripe overlay. No backdrop-filter (heavy on iPhone Safari), no canvas, no images.
// Off by default; Profile switch "Stripe background" (device only), ?stripe=0|1 overrides.
export const STRIPE_BG = {
  // stripes: seamless reeded glass. One period = one flute, smooth stops only (no hard edge, no gap, no solid band).
  // Stop positions are % of the period; the flute is transparent at both ends, so neighbouring periods flow into each other.
  periodPx: 5,
  lightPos: 15,               // % where the highlight (lighter side) peaks
  lightOpacity: 0.13,         // 0..1 white at the peak
  midPos: 55,                 // % where the flute is fully transparent between highlight and shade
  shadePos: 85,               // % where the shade (darker side) peaks
  shadeOpacity: 0.065,        // 0..1 black at the peak
  // second, fainter stripe layer with another period to break the mechanical regularity
  secondEnabled: true,
  secondPeriodMult: 1.37,     // period of the second layer = periodPx x this
  secondOpacityMult: 0.33,    // its alphas = main alphas x this
  // softening of the gradient layers only (never the products); light on iPhone Safari, 0 = off
  blurPx: 1.2,
  saturate: 1.05,             // 1 = unchanged
  blurInsetPx: 6,             // gradient layers extend this far past the edges so the blur has no pale rim
  // gradient
  angleDeg: 160,              // direction of the base gradient
  softness: 0.6,              // 0..1: how far the colour blobs spread (higher = softer, more mixed)
  blobs: [                    // where each colour sits (% of the layer); the first N are used for N colours
    { x: 18, y: 14 },
    { x: 86, y: 46 },
    { x: 30, y: 92 },
  ],
  minColors: 2,               // fewer clear colours are padded with the fallback colour
  maxColors: 3,
  // colour normalisation (HSL, 0..1) so products and text stay readable on top
  lightnessMin: 0.62,         // darker colours are lightened to this
  lightnessMax: 0.86,         // lighter colours are pulled down to this ...
  tintMinSaturation: 0.28,    // ... and given at least this much saturation, so a white or cream product still tints softly
  saturationMin: 0.3,
  saturationMax: 0.65,
  neutralSaturation: 0.12,    // colours below this saturation (black, white, grey, silver) count as neutral
  dropNeutrals: true,         // true = neutrals are left out of the gradient; false = softened to the fallback tone
  neutralMix: 0.6,            // dropNeutrals false: share of the fallback blended in
  fallbackColor: "#eceef2",   // light grey-white, used when no clear colour remains
  baseColor: "#ffffff",       // under the blobs
  crossfadeMs: 450,           // colour change between two outfits (opacity only)
} as const;
