// Pixel-art outfit preview figure + pixel-art seasonal decoration (display only). Tunables first, then the figure's pixel data and colour rules.
export const PIXEL_FIGURE_POSE: "front" | "side" = "front";
export const DECO_PX_MULT = 2;     // one decoration pixel = this many figure pixels
export const DECO_MAX_COUNT = 6;   // most snowflakes / leaves per spot (the two spots stay)

/** Figure grid in pixels: 20 columns x 40 rows (the SVG viewBox is in these units). */
export const PIXEL_GRID = { w: 20, h: 40 } as const;

/** Ops are [key, x, y, w, h], filled in order (later ops overwrite earlier ones). Origin top-left, x to the right, y down.
 *  Keys: H beanie dome, h beanie cuff, S skin, K eyes, B hoodie, b hoodie shade, c drawstrings, P trousers, p trousers shade, q trousers hem / far leg,
 *  W shoe, w shoe sole / far shoe, v far-shoe sole, X bag, x bag handle. */
export type PixelOp = readonly [key: string, x: number, y: number, w: number, h: number];

export const FRONT_OPS: readonly PixelOp[] = [
  ["H", 5, 0, 10, 3], ["h", 5, 3, 10, 2], ["S", 5, 5, 10, 6], ["K", 7, 7, 1, 2], ["K", 12, 7, 1, 2],
  ["B", 5, 11, 10, 16], ["B", 2, 11, 3, 11], ["B", 15, 11, 3, 11], ["b", 4, 12, 1, 10], ["b", 15, 12, 1, 10],
  ["S", 2, 22, 3, 2], ["S", 15, 22, 3, 2], ["c", 8, 12, 1, 6], ["c", 11, 12, 1, 6],
  ["B", 4, 24, 12, 4], ["b", 7, 24, 6, 3], ["b", 4, 27, 12, 1],
  ["P", 4, 28, 12, 3], ["P", 4, 31, 5, 6], ["p", 8, 31, 1, 6], ["P", 11, 31, 5, 6], ["p", 15, 31, 1, 6],
  ["q", 4, 37, 5, 1], ["q", 11, 37, 5, 1],
  ["W", 4, 38, 5, 1], ["w", 4, 39, 5, 1], ["W", 11, 38, 5, 1], ["w", 11, 39, 5, 1],
];

/** the figure faces right */
export const SIDE_OPS: readonly PixelOp[] = [
  ["H", 5, 0, 10, 3], ["h", 5, 3, 10, 2], ["S", 5, 5, 10, 6], ["S", 15, 8, 1, 2], ["K", 12, 7, 1, 2],
  ["B", 4, 11, 1, 3], ["B", 5, 11, 9, 16], ["b", 8, 12, 3, 10], ["S", 8, 22, 3, 2],
  ["B", 4, 24, 11, 4], ["b", 4, 27, 11, 1],
  ["P", 4, 28, 11, 3], ["P", 5, 31, 4, 6], ["p", 9, 31, 1, 6], ["q", 10, 31, 4, 6], ["q", 5, 37, 9, 1],
  ["W", 6, 38, 5, 1], ["w", 6, 39, 5, 1], ["w", 11, 38, 5, 1], ["v", 11, 39, 5, 1],
];

/** drawn last, only when the outfit has a bag */
export const BAG_OPS = {
  front: [["x", 17, 24, 2, 1], ["X", 16, 25, 4, 6]],
  side: [["x", 10, 24, 2, 1], ["X", 9, 25, 4, 6]],
} as const satisfies Record<"front" | "side", readonly PixelOp[]>;

export const PIXEL_KEYS = "HhSKBbcPpqWwvXx";

/** Colour rules. Shades multiply every channel by the factor; the constants never follow the outfit. */
export const PIXEL_COLORS = {
  skin: "#e6c4a2", eyes: "#1a1a1a", hair: "#3a2e28",
  fallback: { top: "#4a4a4f", bottom: "#8fa0b3", shoes: "#f1efe9" },   // used when a part has no usable colour
  shade: { b: 0.72, p: 0.78, q: 0.65, w: 0.87, v: 0.71, h: 0.81, x: 0.7 },
  strings: { onDark: "#d8d8d8", onLight: "#8a8a8a", lightAbove: 0.6 },   // drawstrings: pale on a dark hoodie, grey when the hoodie luminance is above `lightAbove`
  maxLuminance: 0.88, mixTo: "#bdbdbd",                                  // outfit colours lighter than this are mixed toward `mixTo` so they show on white
} as const;
