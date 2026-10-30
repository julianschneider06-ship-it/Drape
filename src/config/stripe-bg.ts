// "Liquid glass" background of the For You feed: a floating rounded glass panel with a colour gradient (colours come from the outfit in view) under fine crisp vertical stripes.
// CSS only: layered gradients, a repeating stripe overlay, inset shadows. No backdrop-filter / blur (heavy on iPhone Safari), no canvas, no images.
// Off by default; Profile switch "Stripe background" (device only), ?stripe=0|1 overrides.
export const STRIPE_BG = {
  // stripes: crisp reeded glass. One period = one flute; stops are % of the period, c = w (white) or k (black), a = alpha 0..1.
  // Every stop fades smoothly into the next (no gap, no solid band): a thin bright edge (~1 px at 10 px period), a faint body highlight, clear middle, a faint shade, a defined shade edge.
  periodPx: 10,
  stops: [
    { pos: 0, c: "w", a: 0 },
    { pos: 6, c: "w", a: 0.22 },     // bright highlight edge
    { pos: 22, c: "w", a: 0.05 },
    { pos: 50, c: "w", a: 0 },
    { pos: 80, c: "k", a: 0.04 },
    { pos: 94, c: "k", a: 0.11 },    // defined faint shadow edge
    { pos: 100, c: "k", a: 0 },
  ],
  // second, fainter stripe layer with another period to break the mechanical regularity
  secondEnabled: true,
  secondPeriodMult: 1.37,     // period of the second layer = periodPx x this
  secondOpacityMult: 0.33,    // its alphas = main alphas x this
  // glass panel: floats above the bottom bar, bottom corners rounded
  panel: {
    gapSidePx: 10,            // space to the left and right screen edge
    gapBottomPx: 10,          // space above the bottom tab bar
    gapTopPx: 0,              // space at the top (used when roundTop is on)
    radiusPx: 32,             // bottom corner radius
    roundTop: false,          // true = top corners rounded too (then gapTopPx applies)
  },
  // Liquid Glass edge (all static CSS, no filters)
  edge: {
    borderWidthPx: 1,
    borderAlpha: 0.42,        // 1 px inner light border (white)
    specularAngleDeg: 135,    // diagonal highlight from the top-left
    specularAlpha: 0.26,
    specularEnd: 38,          // % of the panel where the highlight is gone
    refractionEnabled: true,  // slightly brighter band along the rounded edge
    refractionPx: 14,
    refractionAlpha: 0.2,
    innerShadow: "inset -1px -2px 7px rgba(0,0,0,0.12)",   // along the bottom and right edges
    outerShadow: "0 10px 28px rgba(20,24,40,0.12)",        // very soft shadow under the panel
  },
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
