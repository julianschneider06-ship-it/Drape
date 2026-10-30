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
    rgb: "150,150,158",                 // grey of the fill (Colorful); Simple uses simple.glassRgb
    fillAlpha: 0.5,                     // translucency, SHARED by header and tab bar in both modes (the stripes and the products show through)
    edge: "rgba(255,255,255,0.4)",      // 1 px light edge
    edgeWidthPx: 1,
    specularAlpha: 0.22,                // faint top-left highlight
    shadow: "0 4px 16px rgba(20,24,40,0.16)",
    capsule: true,                      // header + tab bar are pills: both ends full semicircles (radius = half the bar height)
    radiusPx: 12,                       // corner radius when capsule is off
    capsulePadPx: 18,                   // extra inner side padding so logo / toggle / tab icons clear the rounded ends
    marginPx: 8,                        // distance to the screen edges
    stripeBoost: 1.7,                   // refracted stripes inside the glass: alphas x this (max 1)
    stripeShiftPx: 3,                   // ... and shifted sideways by this
    textOn: "#000000",                  // active tab on the glass
    textOff: "#3a3a42",                 // inactive tab on the glass (contrast >= 4.5 on the fill)
  },
  // Simple mode: mostly white with a little grey; no outfit colour anywhere. Stored locally, ?stripe=simple.
  simple: {
    bgTop: "#ffffff",                   // soft vertical gradient, top ...
    bgBottom: "#eeeeee",                // ... to very light grey at the bottom
    secondOpacityMult: 0.33,
    stops: [                            // very faint grey reeded stripes (black alphas only, low)
      { pos: 0, c: "k", a: 0 },
      { pos: 8, c: "k", a: 0.02 },
      { pos: 30, c: "k", a: 0.008 },
      { pos: 60, c: "k", a: 0 },
      { pos: 88, c: "k", a: 0.02 },
      { pos: 96, c: "k", a: 0.045 },
      { pos: 100, c: "k", a: 0 },
    ],
    glassRgb: "214,214,214",            // lighter grey for header + tab bar
    // organic grey areas (soft radial blobs, greys only, no hard edges), placed like the Colorful blobs but with seeded jitter per outfit id
    grey: {
      count: 5,                           // blobs per outfit
      darkCount: 2,                       // of those, this many use the darker grey (the rest the light grey)
      light: "#e4e4e4",                   // mostly light grey ...
      dark: "#c9c9c9",                    // ... some darker areas (kept moderate so white / light products stay readable)
      lightAlpha: 0.75,
      darkAlpha: 0.55,
      softness: 0.6,                      // 0..1 like the Colorful `softness`: higher = larger, softer blobs
      stretch: 0.35,                      // 0..1: how far a blob's width / height may differ (irregular shape)
      jitterPct: 12,                      // random shift of each blob from its anchor (% of the layer)
      anchors: [                          // where blobs sit (% of the layer); the first `count` are used
        { x: 15, y: 12 }, { x: 88, y: 30 }, { x: 40, y: 55 }, { x: 80, y: 82 }, { x: 12, y: 90 },
      ],
    },
  },
} as const;   // crossfadeMs: colour change between two outfits (opacity only)
