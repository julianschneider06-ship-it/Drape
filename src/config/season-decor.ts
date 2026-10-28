// Seasonal decoration behind the outfits (For You feed + Wishlist > Generate Outfits). All numbers live here; drawing in src/lib/season-decor-art.ts.
// Positions are fractions of the decor area (the scroll area of the feed) unless a name says Px.
export const SEASON_DECOR = {
  minFit: 0.4,                         // outfit season fit (tags.season_fit) below this = no clear season = no decoration
  ink: { width: 2.8, outline: 5 },     // ballpoint line width / width of the dark outline pass under light strokes (px)
  wobble: 1.1,                         // deterministic hand-drawn wobble (px)
  opacity: 0.95,

  sun: {
    sizePx: 84, centerInset: 0.1,      // box at the right edge; centre of the disc sits this fraction of the box in from the edges (only a wedge shows)
    topOffsetPx: 64,                   // vertical offset of the sun box from the top of the outfit area (the feed adds the status/safe area); raise to move the sun down
    radius: 0.52, rays: 6, rayGap: 0.1, rayLen: 0.2,   // radius / gap / ray length as fractions of the box
    color: "#ffd23f",                  // one uniform yellow for disc, outline and rays
  },

  meadow: {
    heightPx: 30, blades: 10,          // strip height; number of grass blades spread over the full width
    bladeMin: 9, bladeMax: 20, lean: 4,   // blade height range and sideways lean (px)
    color: "#a9dc86",                  // one uniform light green for strip, edge and blades
  },

  fall: {
    count: 5,                          // pieces per place
    places: [                          // two fixed spots; x = left edge of the spot, y0..y1 = vertical band the pieces fall through (kept away from the top-left icons)
      { x: 0.60, y0: 0.08, y1: 0.46, spread: 0.2 },
      { x: 0.04, y0: 0.50, y1: 0.88, spread: 0.2 },
    ],
    sizePx: [20, 32] as [number, number],
    durationS: [10, 16] as [number, number],   // one fall
    swayS: [3.2, 5.2] as [number, number],     // one sway
    swayPx: 9, swayDeg: 24,
    opacity: [0.7, 1] as [number, number],
  },

  leaves: { fills: ["#f28c28", "#d9432b", "#b8651b", "#e8b630"], stroke: "#7a3b12" },
  snow: { fill: "#f4fbff", outline: "#6aa6d8", stroke: "#e6f4ff" },
} as const;
