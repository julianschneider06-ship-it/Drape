// Seasonal decoration behind the outfits (For You feed + Wishlist > Generate Outfits). All numbers live here; pixel drawing in src/lib/season-decor-art.ts (pixel size: src/config/pixel-figure.ts).
// Positions are fractions of the decor area (the scroll area of the feed) unless a name says Px.
export const SEASON_DECOR = {
  minFit: 0.4,                         // outfit season fit (tags.season_fit) below this = no clear season = no decoration

  sun: {
    pxMult: 1,                         // sun pixel = this x a decoration pixel (16x16 sun: about 46 px wide, like the old 9x9 one)
    topOffsetPx: 64,                   // vertical offset of the sun box from the top of the outfit area (the feed adds the status/safe area); raise to move the sun down
    color: "#ffd23f",                  // one uniform yellow
  },

  meadow: {
    heightPx: 15, blades: 20,          // strip height; number of grass blades spread over the full width
    bladeMin: 9, bladeMax: 20,         // blade height range (px, rounded to whole decoration pixels)
    fringe: 0.4,                       // share of loose blocks on the strip's top edge (uneven edge)
    leanNone: 0.35,                    // share of blades that stand straight; the rest lean left or right
    bendRows: 2,                       // a leaning blade bends over its top this many pixels
    tuft: 0.4, tuftScale: 0.6,         // share of blades with a shorter neighbour, and that neighbour's height relative to the blade
    color: "#5ccf3a",                  // one uniform lively green for strip, edge and blades
  },

  spots: {
    count: 5,                          // pieces per place (static, they just lie there; capped by DECO_MAX_COUNT)
    places: [                          // two fixed spots; x = left edge of the spot, y0..y1 = vertical band the pieces sit in (kept away from the top-left icons)
      { x: 0.60, y0: 0.08, y1: 0.46, spread: 0.2 },
      { x: 0.04, y0: 0.50, y1: 0.88, spread: 0.2 },
    ],
  },

  leaves: { color: "#c1352a", scale: 1 },     // pixel maple leaf: one uniform deep red; scale = size relative to a full decoration bitmap
  snow: { color: "#9db4c8", scale: 0.6 },     // pixel snowflake; scale 0.6 = about 60 % of the former size (count and positions unchanged)
} as const;

// LAYER ORDER (back to front): page / stripe background < seasonal decoration < outfit preview figure < product images < header, tab bar, action rail.
// Named z-index constants; SeasonDecor, Feed and the layer test use them. The decoration is BACKGROUND: it sits behind the figure and behind every product.
// STAGE SOURCES: which elements bound the stage. For You = its header + the tab bar; Wishlist (Generate Outfits, My Outfits) = the whole Wishlist header block
// (title row + Products | Generate Outfits | My Outfits switch) + the tab bar. Selectors only, the geometry is the same function (`stageFromRects`).
export const STAGE_SOURCES = {
  feed: { top: "[data-stage-top]", bottom: "[data-stage-bottom]" },
  wishlist: { top: "[data-stage-wishlist-top]", bottom: "[data-stage-bottom]" },
} as const;
export type StageSource = keyof typeof STAGE_SOURCES;

export const LAYER_Z = { stripe: 0, image: 2, veil: 3, decor: 5, figure: 10, products: 20, chrome: 30 } as const;

// ART MODE (default since Prompt 82: illustrations): painted sprites instead of the pixel art above (kept as `?decor=pixel`). Files in public/season-decor/, made by
// scripts/build-season-decor.py from docs/reference/season-decor-source/*.png (border flood-fill keying, tolerances live in that script).
// STAGE ANCHORING (Prompt 85): every number below is relative to the STAGE = the visible outfit area between the bottom edge of the header and the top edge of the tab bar
// (left/right = the screen edges), NOT the physical screen. The art box has exactly the stage rectangle (+ DECOR_OVERSCAN_PX into the bars) with overflow hidden.
// Size: widthPct of the STAGE width OR heightPct of the STAGE height (the other side follows the sprite's aspect). offsetXPct / offsetYPct move the sprite from its anchor,
// in % of the stage: positive = right / down for left- and top-anchored sprites, for right- / bottom-anchored ones positive = further out (bleeds past that edge); negative = back inside.
export type DecorAnchor = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right";
export type DecorSide = "top" | "bottom" | "left" | "right";
/** One art layer. BORDER RULE: sprites whose content runs up to an image border must coincide with the STAGE edge on THAT side: list those sides in `flush`;
 *  a flush side is placed `DECOR_OVERSCAN_PX` beyond the stage edge (into the bar / off the screen; no margin, no rounding hairline), its offset is ignored. Free sides use offsetXPct / offsetYPct.
 *  SIZE: widthMode "stage" = full stage width (+ overscan), "pct" = widthPct of the stage width, "auto" = follows the height. Height = heightPct of the stage height, or (no heightPct) follows the width.
 *  `aspect` = natural width / height of the sprite file (a test checks it). `stretch: true` allows non-uniform scaling when width and height are both given; the distortion is limited to
 *  +/- `maxStretch` (0.4 = 40 %) of the natural aspect, the height is adjusted if the stage would push it beyond that. Without `stretch` the aspect is kept. `opacity` 0..1. */
export type DecorLayer = {
  src: string; aspect: number; anchor: DecorAnchor; flush?: DecorSide[];
  widthMode?: "stage" | "pct" | "auto"; widthPct?: number; heightPct?: number; stretch?: boolean; maxStretch?: number;
  offsetXPct: number; offsetYPct: number; opacity: number; zIndex: number;
};
export const DECOR_OVERSCAN_PX = 1;
export const DECOR_ART: Record<"spring" | "summer" | "autumn" | "winter", DecorLayer[]> = {
  summer: [
    { src: "/season-decor/summer_sun.webp", aspect: 1028 / 1024, anchor: "top-right", widthMode: "pct", widthPct: 30, offsetXPct: 0, offsetYPct: 3, opacity: 1, zIndex: 2 },   // free-standing: fully visible, top edge 3 % of the stage height below the stage top, right half (clear of the icon row top-left)
    { src: "/season-decor/summer_wave.webp", aspect: 1400 / 467, anchor: "bottom-right", flush: ["bottom", "left", "right"], widthMode: "stage", heightPct: 14, stretch: true, maxStretch: 0.4, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 },
  ],
  spring: [{ src: "/season-decor/spring_meadow.webp", aspect: 1400 / 341, anchor: "bottom", flush: ["bottom", "left", "right"], widthMode: "stage", heightPct: 10, stretch: true, maxStretch: 0.4, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 }],
  autumn: [{ src: "/season-decor/autumn_tree.webp", aspect: 669 / 1400, anchor: "bottom-left", flush: ["top", "bottom", "left"], widthMode: "auto", heightPct: 100, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 }],   // full stage height (flush top + bottom: crown at the header edge, rocks on the tab bar edge), width follows the aspect, no fade
  winter: [
    { src: "/season-decor/winter_clouds.webp", aspect: 1024 / 221, anchor: "top", flush: ["top", "left", "right"], widthMode: "stage", heightPct: 14, stretch: true, maxStretch: 0.4, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 },
    { src: "/season-decor/winter_flakes.webp", aspect: 991 / 346, anchor: "top-right", widthMode: "pct", widthPct: 62, offsetXPct: 0, offsetYPct: 12, opacity: 1, zIndex: 2 },   // small flakes, right side keeps the icon row clear
  ],
};
