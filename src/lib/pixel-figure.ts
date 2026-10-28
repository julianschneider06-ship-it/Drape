// Pixel-art figure: ops -> 20x40 grid -> palette from the outfit's colours -> merged SVG rects (cached per pose + palette). Pure, no React.
import { BAG_OPS, FACE_TEMPLATES, HEAD_TEMPLATES, HEAD_Y, LEGS_OPS, PIXEL_COLORS as K, PIXEL_FIGURE_POSE, PIXEL_GRID, SIDE_OPS, TORSO_TEMPLATES, TORSO_Y, type FaceKey, type HeadKey, type TorsoKey } from "@/config/pixel-figure";
import { memoMarkup, pixelRects, rectsMarkup } from "@/lib/pixel-art";

/** Resolved colours of the shown outfit (hex). `head` / `bag` null = the outfit has none. */
/** `gender` picks the body: "women" = slim figure, anything else / unset = the men's figure. `torso` / `headType` / `face` pick the ready-made templates (see src/config/pixel-figure.ts);
 *  unset torso = hoodie, unset headType = beanie when `head` has a colour, else none (hair), unset face = none. Front pose only; the side pose ignores them. */
export interface FigureSpec { top: string; bottom: string; shoes: string; head: string | null; bag: string | null; gender?: "men" | "women"; torso?: TorsoKey; headType?: Exclude<HeadKey, "none"> | null; face?: FaceKey | null }
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
    z: shade(B, K.shade.z), G: K.sunglasses, F: K.glasses,
    H, h: s.head ? shade(H, K.shade.h) : H, S: K.skin, K: K.eyes, L: K.hair,
    B, b: shade(B, K.shade.b), c: luminance(B) > K.strings.lightAbove ? K.strings.onLight : K.strings.onDark,
    P, p: shade(P, K.shade.p), q: shade(P, K.shade.q),
    W, w: shade(W, K.shade.w), v: shade(W, K.shade.v),
  };
  if (X) { p.X = X; p.x = shade(X, K.shade.x); }
  return p;
}

/** The templates a spec resolves to (defaults applied). */
export const specTemplates = (s: FigureSpec): { torso: TorsoKey; head: HeadKey; face: FaceKey | null } =>
  ({ torso: s.torso ?? "hoodie", head: s.headType ?? (s.head ? "beanie" : "none"), face: s.face ?? null });

/** the figure as rows of op keys ("." = empty). Front: legs, then the torso, head and face templates, then the bag. Side: the fixed side shape (`hat` = beanie or hair). */
export function figureGrid(pose: Pose, bag: boolean, hat: boolean, gender: "men" | "women" = "men", tpl?: { torso?: TorsoKey; head?: HeadKey; face?: FaceKey | null }): string[] {
  const g = Array.from({ length: PIXEL_GRID.h }, () => Array<string>(PIXEL_GRID.w).fill("."));
  const fill = (ops: readonly (readonly [string, number, number, number, number])[]) => { for (const [k, x, y, w, h] of ops) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = k; };
  const lay = (rows: readonly string[], y0: number) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== ".") g[y0 + j][i] = r[i]; });
  if (pose === "side") {
    fill(SIDE_OPS);
    if (!hat) for (let i = 0; i < PIXEL_GRID.w; i++) if (g[4][i] === "h") g[4][i] = "S";
  } else {
    fill(LEGS_OPS[gender]);
    lay(TORSO_TEMPLATES[gender][tpl?.torso ?? "hoodie"], TORSO_Y);
    lay(HEAD_TEMPLATES[gender][tpl?.head ?? (hat ? "beanie" : "none")], HEAD_Y);
    if (tpl?.face) lay(FACE_TEMPLATES[gender][tpl.face], HEAD_Y);
  }
  if (bag) fill(BAG_OPS[pose]);
  return g.map((r) => r.join(""));
}

const cache = memoMarkup();
/** inner SVG markup (rects, viewBox 0 0 20 40) of the figure; memoized per pose + colours */
export function figureMarkup(s: FigureSpec, pose: Pose = PIXEL_FIGURE_POSE): string {
  const g = s.gender === "women" ? "women" : "men", pal = figurePalette(s), t = specTemplates(s), bag = !!s.bag;
  return cache(`${g}|${pose}|${t.torso}|${t.head}|${t.face ?? ""}|${bag ? 1 : 0}|${Object.values(pal).join("")}`, () => rectsMarkup(pixelRects(figureGrid(pose, bag, t.head !== "none", g, t), pal)));
}
