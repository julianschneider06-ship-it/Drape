// Drawing of the seasonal decorations as SVG path strings. Deterministic (seeded wobble, same picture on every render), continuous strokes only.
import { SEASON_DECOR as C } from "@/config/season-decor";
import { seededRnd } from "@/lib/shine";

const f = (n: number) => n.toFixed(1);
type P = [number, number];

/** smooth hand-drawn line through the points: quadratic curves between midpoints, every point nudged by the seeded wobble */
export function wobblyLine(pts: P[], seed: number, wobble: number = C.wobble, closed = false): string {
  const r = seededRnd(seed), q = pts.map(([x, y]) => [x + r() * 2 * wobble, y + r() * 2 * wobble] as P);
  if (q.length < 2) return "";
  if (q.length === 2) return `M${f(q[0][0])} ${f(q[0][1])}L${f(q[1][0])} ${f(q[1][1])}`;
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (closed) {
    const n = q.length, s = mid(q[n - 1], q[0]);
    let d = `M${f(s[0])} ${f(s[1])}`;
    for (let i = 0; i < n; i++) { const m = mid(q[i], q[(i + 1) % n]); d += `Q${f(q[i][0])} ${f(q[i][1])} ${f(m[0])} ${f(m[1])}`; }
    return d + "Z";
  }
  let d = `M${f(q[0][0])} ${f(q[0][1])}`;
  for (let i = 1; i < q.length - 1; i++) { const m = mid(q[i], q[i + 1]); d += `Q${f(q[i][0])} ${f(q[i][1])} ${f(m[0])} ${f(m[1])}`; }
  return d + `L${f(q[q.length - 1][0])} ${f(q[q.length - 1][1])}`;
}

/** Sun in the top right corner of a size x size box: the disc is centred a little inside the corner, so only a rounded wedge shows, plus rays on the visible side. */
export function sunArt(size: number = C.sun.sizePx) {
  const s = C.sun, cx = size * (1 - s.centerInset), cy = size * s.centerInset, r = size * s.radius;
  const disc: P[] = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as P; });
  const rays: string[] = [];
  for (let i = 0; i < s.rays; i++) {   // visible directions: from straight left (180deg) round to straight down (90deg)
    const a = Math.PI / 2 + ((i + 0.5) / s.rays) * (Math.PI / 2), r0 = r + size * s.rayGap, r1 = r0 + size * s.rayLen;
    rays.push(wobblyLine([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], 100 + i, C.wobble * 0.5));
  }
  return { disc: wobblyLine(disc, 7, C.wobble, true), rays };
}

/** Meadow strip of `width` x (heightPx + tallest blade): a wobbly green band at the bottom and short vertical blades standing on it. */
export function meadowArt(width: number) {
  const m = C.meadow, h = m.heightPx, top = m.bladeMax + 2, total = top + h, r = seededRnd(31);
  const n = m.blades;
  const edge: P[] = []; for (let x = -6; x <= width + 6; x += 14) edge.push([x, top + r() * 3]);
  const band = wobblyLine(edge, 11, 0.8) + `L${f(width + 8)} ${f(total + 4)}L-8 ${f(total + 4)}Z`;
  const blades: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5 + r() * 0.6) / n) * width, bh = m.bladeMin + (r() + 0.5) * (m.bladeMax - m.bladeMin), lean = r() * m.lean;
    blades.push(wobblyLine([[x, top + 3], [x + lean * 0.4, top + 3 - bh * 0.5], [x + lean, top + 3 - bh]], 200 + i, 0.5));
  }
  return { band, blades, height: total };
}

/** Falling leaf in a 24 x 24 box: pointed oval with a vein. */
export function leafArt(seed: number) {
  return { body: wobblyLine([[12, 1.5], [18.5, 7], [19, 14], [12, 22.5], [5, 14], [5.5, 7]], seed, 0.7, true), vein: wobblyLine([[12, 4], [12, 12], [12, 22]], seed + 1, 0.4) };
}

/** Snowflake in a 24 x 24 box: three crossing arms with a small V at the end of each. */
export function flakeArt(seed: number) {
  const arms: string[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI, x = Math.cos(a) * 10, y = Math.sin(a) * 10;
    arms.push(wobblyLine([[12 - x, 12 - y], [12 + x, 12 + y]], seed + i, 0.4));
    for (const sgn of [1, -1]) {
      const bx = 12 + x * 0.62 * sgn, by = 12 + y * 0.62 * sgn, ex = 12 + x * sgn, ey = 12 + y * sgn;
      for (const k of [-1, 1]) arms.push(wobblyLine([[bx, by], [bx + (ex - bx) * 0.5 + -(ey - by) * 0.35 * k, by + (ey - by) * 0.5 + (ex - bx) * 0.35 * k]], seed + 9 + i + k, 0.2));
    }
  }
  return arms.join("");
}

/** One falling piece: where it sits next to the place's left edge, its size, colours' index, timings. Seeded, so the picture never changes between renders. */
export interface FallPiece { dx: number; size: number; fill: number; fallS: number; swayS: number; delayS: number; swayDelayS: number; opacity: number; startPct: number; seed: number }
export function fallPieces(placeIdx: number, widthPx: number): FallPiece[] {
  const F = C.fall, r = seededRnd(500 + placeIdx * 17), u = () => r() + 0.5;   // 0..1
  const span = F.places[placeIdx].spread * widthPx;
  return Array.from({ length: F.count }, (_, k) => {
    const dur = F.durationS[0] + u() * (F.durationS[1] - F.durationS[0]);
    return {
      dx: (((k * 3) % F.count) / Math.max(1, F.count - 1)) * span + r() * 8,   // x and fall phase use different orders, so the pieces do not line up diagonally
 size: F.sizePx[0] + u() * (F.sizePx[1] - F.sizePx[0]), fill: k,
      fallS: dur, swayS: F.swayS[0] + u() * (F.swayS[1] - F.swayS[0]),
      delayS: (((k * 2) % F.count) / F.count) * dur, swayDelayS: u() * 3,   // staggered, so the pieces are spread over the band from the first frame
      opacity: F.opacity[0] + u() * (F.opacity[1] - F.opacity[0]), startPct: 10 + (((k * 2) % F.count) / F.count) * 70, seed: 800 + placeIdx * 31 + k * 5,
    };
  });
}
