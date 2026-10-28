import { SHINE } from "@/config/search";

/** The colour names of the taxonomy as display colours (the product's main colour is the first entry of its colour list). */
export const COLOR_HEX: Record<string, string> = {
  black: "#1a1a1a", white: "#ffffff", grey: "#8b9099", beige: "#d8c3a5", brown: "#7b4a2d", navy: "#1f2a55", blue: "#2f6fd0", green: "#2f9e5b", olive: "#6b6b2a",
  red: "#e0221b", burgundy: "#7a1f3d", pink: "#f4a6c0", purple: "#7a3fb0", orange: "#f08a24", yellow: "#f2c230", cream: "#f3ead3", silver: "#b8bcc4", gold: "#d4a017",
};

/** ?shine=0 turns the strokes off (anything else = on) */
export const shineOn = (search: string): boolean => new URLSearchParams(search).get("shine") !== "0";

/** the strokes show only while the Highlight chip is on; ?shine=0 forces them off whatever the chip says */
export const shineVisible = (search: string, highlight: boolean): boolean => highlight && shineOn(search);

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
/** WCAG contrast of a colour against a white background */
export const contrastOnWhite = (h: string): number => { const [r, g, b] = rgb(h); return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05); };
const hue = (h: string): { h: number; s: number } => {
  const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return { h: 0, s: 0 };
  const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (hh * 60 + 360) % 360, s: d / (1 - Math.abs(mx + mn - 1) || 1) };
};

/** Stroke colour for the searched piece: its main colour, darkened just enough to be readable on white; light grey without a usable colour,
 *  and light grey when the piece has the red sale outline and the colour is red or close to it (so strokes and outline do not blend). */
export function shineColor(name: string | null | undefined, onSale: boolean, cfg = SHINE): string {
  let c = name ? COLOR_HEX[name] : undefined;   // multicolor / unknown names have no single colour
  if (!c) return cfg.fallback;
  for (let k = 0; contrastOnWhite(c) < cfg.minContrast && k < 40; k++) c = hex(rgb(c).map((v) => v * 0.94));
  if (onSale) { const { h, s } = hue(c); if (s > 0.25 && (h <= cfg.redTolerance || h >= 360 - cfg.redTolerance)) return cfg.fallback; }
  return c;
}

/** Short wobbly strokes on an ellipse around a w x h box, as SVG path strings in box coordinates (origin = box top left; they lie outside the box). Deterministic per seed. */
/** Seeded random numbers in [-0.5, 0.5), shared by every hand-drawn element (shine strokes, price box): same seed = same drawing. */
export const seededRnd = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
};

export function shineStrokes(w: number, h: number, seed: number, onSale: boolean, cfg = SHINE): string[] {
  const rnd = seededRnd(seed);
  const d = cfg.distance + (onSale ? cfg.saleExtra : 0), cx = w / 2, cy = h / 2, start = rnd() * Math.PI;
  const f = (n: number) => n.toFixed(1);
  return Array.from({ length: cfg.count }, (_, i) => {
    const a = start + (i / cfg.count) * Math.PI * 2 + rnd() * 0.12, ca = Math.cos(a), sa = Math.sin(a);
    // distance along the ray from the centre to the box edge, then out by d (inner end) and by d + length (outer end)
    const edge = 1 / Math.max(Math.abs(ca) / (w / 2), Math.abs(sa) / (h / 2), 1e-6);
    const r0 = edge + d, r1 = r0 + cfg.length * (1 + rnd() * 0.3);
    const x0 = cx + ca * r0, y0 = cy + sa * r0, x1 = cx + ca * r1, y1 = cy + sa * r1;
    const mx = (x0 + x1) / 2 - sa * cfg.wobble * (1 + rnd()), my = (y0 + y1) / 2 + ca * cfg.wobble * (1 + rnd());
    return `M${f(x0)} ${f(y0)}Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`;
  });
}

/** Hand-drawn rectangle outline w x h as SVG path strings (four wobbly sides that overshoot their corners a little), same wobble randomness as the shine strokes. Deterministic per seed. */
export function wobblyBox(w: number, h: number, seed: number, cfg: { wobble: number; overshoot: number }): string[] {
  const rnd = seededRnd(seed), f = (n: number) => n.toFixed(1), j = () => rnd() * 2 * cfg.wobble, o = () => cfg.overshoot * (0.5 + rnd());
  const side = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const a = [x0 - ux * o() + j(), y0 - uy * o() + j()], b = [x1 + ux * o() + j(), y1 + uy * o() + j()];
    const mx = (x0 + x1) / 2 - uy * j() * 1.4, my = (y0 + y1) / 2 + ux * j() * 1.4;
    return `M${f(a[0])} ${f(a[1])}Q${f(mx)} ${f(my)} ${f(b[0])} ${f(b[1])}`;
  };
  return [side(0, 0, w, 0), side(w, 0, w, h), side(w, h, 0, h), side(0, h, 0, 0)];
}
