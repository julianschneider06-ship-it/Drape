// Pixel-art figure: ops -> 20x40 grid -> palette from the outfit's colours -> merged SVG rects (cached per pose + palette). Pure, no React.
import { BAG_OPS, FRONT_OPS, PIXEL_COLORS as K, PIXEL_FIGURE_POSE, PIXEL_GRID, SIDE_OPS } from "@/config/pixel-figure";
import { memoMarkup, pixelRects, rectsMarkup } from "@/lib/pixel-art";

/** Resolved colours of the shown outfit (hex). `head` / `bag` null = the outfit has none. */
export interface FigureSpec { top: string; bottom: string; shoes: string; head: string | null; bag: string | null }
export type Pose = "front" | "side";
export type Palette = Record<string, string>;

const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
/** WCAG relative luminance, 0..1 */
export const luminance = (h: string): number => {
  const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const shade = (h: string, f: number): string => hex(rgb(h).map((v) => v * f));
/** a colour lighter than `maxLuminance` is mixed toward `mixTo` in small steps until it is not */
export function clampLight(h: string): string {
  if (luminance(h) <= K.maxLuminance) return h;
  const a = rgb(h), b = rgb(K.mixTo);
  for (let t = 0.05; t < 1; t += 0.05) { const m = hex(a.map((v, i) => v * (1 - t) + b[i] * t)); if (luminance(m) <= K.maxLuminance) return m; }
  return K.mixTo;
}

export function figurePalette(s: FigureSpec): Palette {
  const B = clampLight(s.top), P = clampLight(s.bottom), W = clampLight(s.shoes), H = s.head ? clampLight(s.head) : K.hair, X = s.bag ? clampLight(s.bag) : null;
  const p: Palette = {
    H, h: s.head ? shade(H, K.shade.h) : H, S: K.skin, K: K.eyes,
    B, b: shade(B, K.shade.b), c: luminance(B) > K.strings.lightAbove ? K.strings.onLight : K.strings.onDark,
    P, p: shade(P, K.shade.p), q: shade(P, K.shade.q),
    W, w: shade(W, K.shade.w), v: shade(W, K.shade.v),
  };
  if (X) { p.X = X; p.x = shade(X, K.shade.x); }
  return p;
}

/** the figure as rows of op keys ("." = empty); `hat` false = hair: the cuff row below the dome becomes skin (forehead) */
export function figureGrid(pose: Pose, bag: boolean, hat: boolean): string[] {
  const g = Array.from({ length: PIXEL_GRID.h }, () => Array<string>(PIXEL_GRID.w).fill("."));
  const fill = (ops: readonly (readonly [string, number, number, number, number])[]) => { for (const [k, x, y, w, h] of ops) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = k; };
  fill(pose === "side" ? SIDE_OPS : FRONT_OPS);
  if (!hat) for (let i = 0; i < PIXEL_GRID.w; i++) if (g[4][i] === "h") g[4][i] = "S";
  if (bag) fill(BAG_OPS[pose]);
  return g.map((r) => r.join(""));
}

const cache = memoMarkup();
/** inner SVG markup (rects, viewBox 0 0 20 40) of the figure; memoized per pose + colours */
export function figureMarkup(s: FigureSpec, pose: Pose = PIXEL_FIGURE_POSE): string {
  const pal = figurePalette(s), hat = !!s.head, bag = !!s.bag;
  return cache(`${pose}|${hat ? 1 : 0}${bag ? 1 : 0}|${Object.values(pal).join("")}`, () => rectsMarkup(pixelRects(figureGrid(pose, bag, hat), pal)));
}
