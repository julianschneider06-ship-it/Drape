// Drawing of the outfit preview figure as SVG path strings (deterministic wobble, continuous outlines, flat fills). Front view, drawing space = MANNEQUIN.view.
import { MANNEQUIN as C } from "@/config/mannequin";
import { wobblyLine } from "@/lib/season-decor-art";
import type { MannequinSpec } from "@/lib/mannequin";

type P = [number, number];
export interface Part { key: string; d: string; fill: string }
const DY = 5;   // design coordinates start at the head top (y 3); this leaves room for hats above
const lift = (pts: P[]): P[] => pts.map(([x, y]) => [x, y + DY]);
const mirror = (pts: P[]): P[] => pts.map(([x, y]) => [60 - x, y]);
/** straight-ish closed shape: a point halfway along every edge keeps the sides flat while the corners round off */
const shape = (pts: P[], seed: number) => wobblyLine(lift(pts).flatMap((p, i, a) => { const n = a[(i + 1) % a.length]; return [p, [(p[0] + n[0]) / 2, (p[1] + n[1]) / 2] as P]; }), seed, C.line.wobble, true);
const line = (pts: P[], seed: number) => wobblyLine(lift(pts), seed, C.line.wobble);

const HEAD: P[] = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return [30 + Math.cos(a) * 9, 14 + Math.sin(a) * 9] as P; });
const WAIST = 58;

/** parts in drawing order (back to front); `fill` "none" = a line */
export function mannequinArt(s: MannequinSpec): Part[] {
  const out: Part[] = [], add = (key: string, d: string, fill: string) => out.push({ key, d, fill });
  const dress = s.top.shape === "dress", long = s.top.shape === "long";
  if (s.top.hood) add("hood", shape([[18, 22], [30, 18], [42, 22], [43, 30], [17, 30]], 11), s.top.color);   // a thick bulge behind the neck
  // arms and legs (skin) under the clothes
  for (const [i, pts] of [[0, [[19, 28], [13, 29], [8, 62], [13, 63]]], [1, mirror([[19, 28], [13, 29], [8, 62], [13, 63]])]] as [number, P[]][]) add(`arm${i}`, shape(pts, 20 + i), C.skin);
  add("legL", shape([[23, 58], [29, 58], [28.5, 102], [23.5, 102]], 22), C.skin);
  add("legR", shape([[31, 58], [37, 58], [36.5, 102], [31.5, 102]], 23), C.skin);
  if (s.bottom) {
    const b = s.bottom.shape;
    const pts: P[] = b === "short" ? [[20, WAIST], [40, WAIST], [41, 78], [31, 78], [30, 68], [29, 78], [19, 78]]
      : b === "wide" ? [[20, WAIST], [40, WAIST], [44, 101], [31.5, 101], [30, 74], [28.5, 101], [16, 101]]
      : [[20, WAIST], [40, WAIST], [39.5, 101], [31.8, 101], [30, 74], [28.2, 101], [20.5, 101]];
    add("bottom", shape(pts, 30), s.bottom.color);
  }
  // shoes (over the trouser ends)
  const boot = s.shoes.kind === "high";
  const shoe: P[] = boot ? [[22, 92], [29.5, 92], [30, 105], [28, 107.5], [18.5, 107.5], [19, 104], [21.5, 100]] : [[22, 100], [29.5, 100], [30, 105], [28, 107], [18.5, 107], [19, 104]];
  add("shoeL", shape(shoe, 40), s.shoes.color); add("shoeR", shape(mirror(shoe), 41), s.shoes.color);
  // torso, dress, sleeves
  const body: P[] = dress ? [[19, 26], [41, 26], [40, 45], [45, s.top.hem === "long" ? 88 : 66], [15, s.top.hem === "long" ? 88 : 66], [20, 45]] : [[19, 26], [41, 26], [42, s.top.shape === "short" ? 57 : 64], [18, s.top.shape === "short" ? 57 : 64]];
  add("neck", shape([[27, 20], [33, 20], [33, 27], [27, 27]], 50), C.skin);
  add("body", shape(body, 51), s.top.color);
  const sleeve: P[] = long ? [[20, 26], [13, 27], [9, 56], [15, 57]] : [[20, 26], [13, 27], [11, 38], [18, 39]];
  add("sleeveL", shape(sleeve, 52), s.top.color); add("sleeveR", shape(mirror(sleeve), 53), s.top.color);
  add("head", shape(HEAD, 60), C.skin);
  if (s.head) {
    const h = s.head;
    if (h.kind === "cap") { add("cap", shape([[20, 8], [21, 2], [30, -1], [39, 2], [40, 8]], 61), h.color); add("brim", shape([[19, 7], [41, 7], [40, 10], [20, 10]], 62), h.color); }
    else if (h.kind === "hat") { add("crown", shape([[21, 7], [22, -1], [38, -1], [39, 7]], 63), h.color); add("brim", shape([[12, 7], [48, 7], [46, 10], [14, 10]], 64), h.color); }
    else { add("beanie", shape([[20, 8], [21, 1], [30, -2], [39, 1], [40, 8]], 65), h.color); add("band", shape([[19.5, 6], [40.5, 6], [40, 9.5], [20, 9.5]], 66), h.color); }
  }
  if (s.glasses) { add("lensL", shape([[22.5, 11], [28.5, 11], [28, 15], [23, 15]], 70), C.line.color); add("lensR", shape([[31.5, 11], [37.5, 11], [37, 15], [32, 15]], 71), C.line.color); add("bridge", line([[28, 12], [32, 12]], 72), "none"); }
  if (s.bag) { add("strap", line([[46, 66], [47, 56], [53, 56], [54, 66]], 80), "none"); add("bag", shape([[44, 64], [56, 64], [57, 78], [43, 78]], 81), s.bag.color); }
  return out;
}
