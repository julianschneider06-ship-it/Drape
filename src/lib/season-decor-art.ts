// Seasonal decorations as flat pixel art: 16x16 bitmaps (# = pixel, . = empty) and a pixel meadow strip. Pure, deterministic, memoized markup.
import { DECO_MAX_COUNT, DECO_PX_MULT, PIXEL_GRID } from "@/config/pixel-figure";
import { MANNEQUIN } from "@/config/mannequin";
import { SEASON_DECOR as C } from "@/config/season-decor";
import { memoMarkup, pixelRects, rectsMarkup } from "@/lib/pixel-art";
import { seededRnd } from "@/lib/shine";

export const DECO_BITMAP_SIZE = 16;
export const DECO_BITMAP_CHARS = ".#v";

/** Snowflake, 16x16: six-armed look with arrowhead branches and short diagonal arms, symmetric on both axes. */
export const SNOWFLAKE_BITMAP: readonly string[] = [
  ".......##.......",
  ".....#.##.#.....",
  "......####......",
  ".....#.##.#.....",
  "......####......",
  ".#.#.#.##.#.#.#.",
  "..#.#.####.#.#..",
  "################",
  "################",
  "..#.#.####.#.#..",
  ".#.#.#.##.#.#.#.",
  "......####......",
  ".....#.##.#.....",
  "......####......",
  ".....#.##.#.....",
  ".......##.......",
];
/** Maple leaf, 16x16: pointed lobes (top, two sides, two lower tips) and a short stem at the bottom, symmetric, one colour. */
export const LEAF_BITMAP: readonly string[] = [
  ".......##.......",
  "......####......",
  ".#....####....#.",
  ".##..######..##.",
  ".###.######.###.",
  "..############..",
  ".##############.",
  "..############..",
  "...##########...",
  "..#..######..#..",
  ".....######.....",
  "......####......",
  ".......##.......",
  ".......##.......",
  ".......##.......",
  "................",
];
/** Sun, 16x16: a disc centred on the top right corner (only the visible quarter is drawn) with single-pixel rays around it. */
export const SUN_BITMAP: readonly string[] = [
  "....##..########",
  "........########",
  "........########",
  ".........#######",
  "......#..#######",
  ".....#....######",
  "...........#####",
  ".............###",
  ".........#......",
  "........#.......",
  "............#..#",
  "............#..#",
  "................",
  "................",
  "................",
  "................",
];

/** one figure pixel / one decoration pixel in screen px */
export const figurePx = (): number => MANNEQUIN.heightPx / PIXEL_GRID.h;
export const decoPx = (): number => figurePx() * DECO_PX_MULT;
/** the sun may use a different pixel size (`sun.pxMult`) */
export const sunPx = (): number => decoPx() * C.sun.pxMult;
export const snap = (v: number, px: number = decoPx()): number => Math.round(v / px) * px;

const cache = memoMarkup();
/** inner SVG markup of a 16x16 bitmap (viewBox 0 0 16 16) in the given colours */
export const bitmapMarkup = (name: string, bitmap: readonly string[], colors: Record<string, string>): string =>
  cache(`${name}|${Object.values(colors).join("")}`, () => rectsMarkup(pixelRects(bitmap, colors)));

export const snowMarkup = () => bitmapMarkup("snow", SNOWFLAKE_BITMAP, { "#": C.snow.color });
export const leafMarkup = () => bitmapMarkup("leaf", LEAF_BITMAP, { "#": C.leaves.color });
export const sunMarkup = () => bitmapMarkup("sun", SUN_BITMAP, { "#": C.sun.color });

/** Meadow strip: `rows` full rows of green blocks with single-pixel blades standing on it. The strip's top edge is slightly uneven (a fringe row of loose blocks), blades differ in height and
 *  lean (none / left / right, bent at the tip), and some blades have a shorter neighbour (a tuft). Grid = cols x (bladeRows + rows). */
export function meadowGrid(width: number, px: number = decoPx()): string[] {
  const m = C.meadow, cols = Math.max(1, Math.ceil(width / px)), rows = Math.max(1, Math.round(m.heightPx / px)), bladeRows = Math.max(2, Math.round(m.bladeMax / px));
  const minRows = Math.max(1, Math.round(m.bladeMin / px)), r = seededRnd(31);
  const g = Array.from({ length: bladeRows + rows }, () => Array<string>(cols).fill("."));
  for (let y = bladeRows; y < bladeRows + rows; y++) g[y].fill("#");
  for (let x = 0; x < cols; x++) if (r() + 0.5 < m.fringe) g[bladeRows - 1][x] = "#";   // uneven top edge
  const blade = (x: number, h: number, lean: number) => {
    for (let k = 1; k <= h; k++) {
      const bend = lean && k > h - m.bendRows ? lean : 0, xx = Math.max(0, Math.min(cols - 1, x + bend));
      g[Math.max(0, bladeRows - k)][xx] = "#";
    }
  };
  const n = Math.min(m.blades, cols);
  for (let i = 0; i < n; i++) {
    const x = Math.min(cols - 1, Math.floor(((i + 0.5 + r() * 0.6) / n) * cols)), h = minRows + Math.floor((r() + 0.5) * (bladeRows - minRows + 1)), u = r() + 0.5;
    const lean = u < m.leanNone ? 0 : r() > 0 ? 1 : -1;
    blade(x, Math.min(h, bladeRows), lean);
    if (r() + 0.5 < m.tuft) blade(x + (r() > 0 ? 2 : -2), Math.max(1, Math.round(h * m.tuftScale)), -lean);   // shorter neighbour leaning the other way
  }
  return g.map((row) => row.join(""));
}
export const meadowMarkup = (width: number): { html: string; cols: number; rows: number } => {
  const g = meadowGrid(width), px = decoPx();
  return { html: cache(`meadow|${g[0].length}|${px}|${C.meadow.color}`, () => rectsMarkup(pixelRects(g, { "#": C.meadow.color }))), cols: g[0].length, rows: g.length };
};

/** One static piece: offset next to the place's left edge and position inside the band (0..1). Seeded, so the picture never changes between renders. */
export interface SpotPiece { dx: number; yFrac: number; seed: number }
export function spotPieces(placeIdx: number, widthPx: number): SpotPiece[] {
  const F = C.spots, r = seededRnd(500 + placeIdx * 17), u = () => r() + 0.5;   // 0..1
  const count = Math.min(F.count, DECO_MAX_COUNT), span = F.places[placeIdx].spread * widthPx;
  return Array.from({ length: count }, (_, k) => ({
    dx: (((k * 3) % count) / Math.max(1, count - 1)) * span + r() * 8,
    yFrac: (((k * 2) % count) + u() * 0.8) / count * 0.9,
    seed: 800 + placeIdx * 31 + k * 5,
  }));
}
