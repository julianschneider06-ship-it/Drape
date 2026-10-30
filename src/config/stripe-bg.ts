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
  // top-left specular highlight over the whole screen (soft white gradient, static)
  specular: { angleDeg: 135, alpha: 0.2, endPct: 42 },
  // very bottom of the screen: the last zone tilts the stripes gently to the left (flat arc, no corner). The tilt grows slice by slice from 0 to maxDeg
  // and each slice is shifted so the stripes stay continuous at the slice borders. Static CSS transforms.
  curve: {
    zonePx: 26,               // height of the tilted zone at the bottom edge
    maxDeg: 4,                // tilt at the very bottom edge
    slices: 6,                // more slices = smoother arc
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
  crossfadeMs: 450,
  // grey glass pieces for the controls (header + bottom bar) while the stripe background is on in the For You feed
  glass: {
    fill: "rgba(150,150,158,0.62)",     // grey semi-transparent fill
    edge: "rgba(255,255,255,0.4)",      // 1 px light edge
    edgeWidthPx: 1,
    specularAlpha: 0.22,                // faint top-left highlight
    shadow: "0 4px 16px rgba(20,24,40,0.16)",
    radiusPx: 12,
    marginPx: 8,                        // distance to the screen edges
    stripeBoost: 1.7,                   // refracted stripes inside the glass: alphas x this (max 1)
    stripeShiftPx: 3,                   // ... and shifted sideways by this
    textOn: "#000000",                  // active tab on the glass
    textOff: "#3a3a42",                 // inactive tab on the glass (contrast >= 4.5 on the fill)
  },           // colour change between two outfits (opacity only)
} as const;
