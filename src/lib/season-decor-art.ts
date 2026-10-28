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

/** Maple leaf in a 24 x 24 box: one continuous outline with pointed lobes, plus a short stem. */
export function leafArt(seed: number) {
  const pts: P[] = [[12, 0.3], [13.6, 7.2], [20.5, 3], [17, 10.8], [23.7, 11.5], [16.8, 15], [19.5, 20.5], [13, 17.6], [12, 20], [11, 17.6], [4.5, 20.5], [7.2, 15], [0.3, 11.5], [7, 10.8], [3.5, 3], [10.4, 7.2]];
  return { body: wobblyLine(pts, seed, 0.5, true), stem: wobblyLine([[12, 18], [12, 23]], seed + 1, 0.3) };
}

/** Snowflake in a 24 x 24 box: four straight strokes crossing at the centre (8 points). */
export function flakeArt(seed: number) {
  let d = "";
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI, x = Math.cos(a) * 10.5, y = Math.sin(a) * 10.5;
    d += wobblyLine([[12 - x, 12 - y], [12 + x, 12 + y]], seed + i, 0.5);
  }
  return d;
}

/** One static piece: offset next to the place's left edge, position inside the band (0..1), size, tilt, opacity. Seeded, so the picture never changes between renders. */
export interface SpotPiece { dx: number; yFrac: number; size: number; tilt: number; opacity: number; seed: number }
export function spotPieces(placeIdx: number, widthPx: number): SpotPiece[] {
  const F = C.spots, r = seededRnd(500 + placeIdx * 17), u = () => r() + 0.5;   // 0..1
  const span = F.places[placeIdx].spread * widthPx;
  return Array.from({ length: F.count }, (_, k) => ({
    dx: (((k * 3) % F.count) / Math.max(1, F.count - 1)) * span + r() * 8,
    yFrac: (((k * 2) % F.count) + u() * 0.8) / F.count * 0.9,
    size: F.sizePx[0] + u() * (F.sizePx[1] - F.sizePx[0]),
    tilt: (u() * 2 - 1) * F.tiltDeg,
    opacity: F.opacity[0] + u() * (F.opacity[1] - F.opacity[0]),
    seed: 800 + placeIdx * 31 + k * 5,
  }));
}
