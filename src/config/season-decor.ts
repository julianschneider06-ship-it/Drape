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
export const LAYER_Z = { stripe: 0, decor: 5, figure: 10, products: 20, chrome: 30 } as const;

// ART MODE (default since Prompt 82: 5 illustrations): painted sprites instead of the pixel art above (kept as `?decor=pixel`). Files in public/season-decor/, made by
// scripts/build-season-decor.py from docs/reference/season-decor-source/*.png (border flood-fill keying, tolerances live in that script).
// Layer box = the decor area (same box as the feed scroller). Size: widthPct of the area width OR heightPct of the area height (the other side follows the
// sprite's aspect). offsetXPct / offsetYPct move the sprite from its anchor (positive = right / down, negative = cropped by the edge), in % of the area.
export type DecorAnchor = "top-left" | "top" | "top-right" | "left" | "right" | "bottom-left" | "bottom" | "bottom-right";
export type DecorLayer = { src: string; anchor: DecorAnchor; widthPct?: number; heightPct?: number; offsetXPct: number; offsetYPct: number; opacity: number; zIndex: number };
export const DECOR_ART: Record<"spring" | "summer" | "autumn" | "winter", DecorLayer[]> = {
  summer: [
    { src: "/season-decor/summer_sun.webp", anchor: "top-left", widthPct: 42, offsetXPct: -10, offsetYPct: -4, opacity: 1, zIndex: 2 },
    { src: "/season-decor/summer_wave.webp", anchor: "bottom-right", heightPct: 16, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 },
  ],
  spring: [{ src: "/season-decor/spring_meadow.webp", anchor: "bottom", heightPct: 14, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 }],
  autumn: [{ src: "/season-decor/autumn_tree.webp", anchor: "bottom-left", heightPct: 75, offsetXPct: -6, offsetYPct: 0, opacity: 1, zIndex: 1 }],
  winter: [{ src: "/season-decor/winter_clouds.webp", anchor: "top", heightPct: 30, offsetXPct: 0, offsetYPct: 0, opacity: 1, zIndex: 1 }],
};
