// "Ribbed glass" background of the For You feed: a soft colour gradient (colours come from the outfit in view) under fine vertical stripes.
// CSS only: layered gradients + a repeating stripe overlay. No backdrop-filter (heavy on iPhone Safari), no canvas, no images.
// Off by default; Profile switch "Stripe background" (device only), ?stripe=0|1 overrides.
export const STRIPE_BG = {
  // stripes (px). One period = width + gap; a light highlight stripe followed by a faint shaded gap = reeded glass.
  stripeWidthPx: 2,
  stripeGapPx: 3,
  stripeLightOpacity: 0.34,   // 0..1 white highlight (the lightening of the gradient)
  stripeShadeOpacity: 0.05,   // 0..1 black in the gap (the slight distortion / contrast)
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
