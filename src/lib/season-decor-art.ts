// Seasonal decorations as flat pixel art: 9x9 bitmaps (# = pixel, v = vein, . = empty) and a pixel meadow strip. Pure, deterministic, memoized markup.
import { DECO_MAX_COUNT, DECO_PX_MULT, PIXEL_GRID } from "@/config/pixel-figure";
import { MANNEQUIN } from "@/config/mannequin";
import { SEASON_DECOR as C } from "@/config/season-decor";
import { memoMarkup, pixelRects, rectsMarkup } from "@/lib/pixel-art";
import { seededRnd } from "@/lib/shine";

export const DECO_BITMAP_SIZE = 9;
export const DECO_BITMAP_CHARS = ".#v";

export const SNOWFLAKE_BITMAP: readonly string[] = [
  "....#....",
  ".#..#..#.",
  "..#.#.#..",
  "...###...",
  "#########",
  "...###...",
  "..#.#.#..",
  ".#..#..#.",
  "....#....",
];
export const LEAF_BITMAP: readonly string[] = [
  "......##v",
  "....###v#",
  "...###v##",
  "..###v###",
  ".###v###.",
  ".##v###..",
  ".#v###...",
  "#v##.....",
  "v........",
];
/** Sun, 9x9: a disc centred on the top right corner (only the visible wedge is drawn) with a few single-pixel rays. */
export const SUN_BITMAP: readonly string[] = [
  "##..#####",
  "....#####",
  ".....####",
  "..#...###",
  ".......##",
  "...#.....",
  ".....#...",
  "........#",
  "........#",
];

/** one figure pixel / one decoration pixel in screen px */
export const figurePx = (): number => MANNEQUIN.heightPx / PIXEL_GRID.h;
export const decoPx = (): number => figurePx() * DECO_PX_MULT;
/** the sun is drawn with chunkier pixels so the corner sun keeps its size */
export const sunPx = (): number => decoPx() * C.sun.pxMult;
export const snap = (v: number, px: number = decoPx()): number => Math.round(v / px) * px;

const cache = memoMarkup();
/** inner SVG markup of a 9x9 bitmap (viewBox 0 0 9 9) in the given colours */
export const bitmapMarkup = (name: string, bitmap: readonly string[], colors: Record<string, string>): string =>
  cache(`${name}|${Object.values(colors).join("")}`, () => rectsMarkup(pixelRects(bitmap, colors)));

export const snowMarkup = () => bitmapMarkup("snow", SNOWFLAKE_BITMAP, { "#": C.snow.color });
export const leafMarkup = () => bitmapMarkup("leaf", LEAF_BITMAP, { "#": C.leaves.color, v: C.leaves.vein });
export const sunMarkup = () => bitmapMarkup("sun", SUN_BITMAP, { "#": C.sun.color });

/** Meadow strip: `rows` full rows of green blocks with single-pixel blades (1..bladeRows tall, the tallest lean one block) standing on it. Grid = cols x (bladeRows + rows). */
export function meadowGrid(width: number, px: number = decoPx()): string[] {
  const m = C.meadow, cols = Math.max(1, Math.ceil(width / px)), rows = Math.max(1, Math.round(m.heightPx / px)), bladeRows = Math.max(1, Math.round(m.bladeMax / px));
  const minRows = Math.max(1, Math.round(m.bladeMin / px)), r = seededRnd(31);
  const g = Array.from({ length: bladeRows + rows }, () => Array<string>(cols).fill("."));
  for (let y = bladeRows; y < bladeRows + rows; y++) g[y].fill("#");
  const n = Math.min(m.blades, cols);
  for (let i = 0; i < n; i++) {
    const x = Math.min(cols - 1, Math.floor(((i + 0.5 + r() * 0.6) / n) * cols)), h = minRows + Math.floor((r() + 0.5) * (bladeRows - minRows + 1)), lean = r() > 0.15 ? 1 : 0;
    for (let k = 1; k <= h; k++) { const xx = k === h && lean && x + 1 < cols ? x + 1 : x; g[bladeRows - k][xx] = "#"; }
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
