// Liquid-glass background, pure logic (no React): outfit -> 2..3 readable colours -> CSS strings, plus the setting.
import { STRIPE_BG as C } from "@/config/stripe-bg";
import type React from "react";
import { COLOR_HEX, seededRnd } from "@/lib/shine";
import { hash32 } from "@/lib/layout/engine";
import type { StripeMode } from "@/lib/shop-pref";
import type { FeedCard, FeedOutfit } from "@/lib/types";

type Cfg = typeof C;

const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function toHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2, k = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return toHex([r + m, g + m, b + m]);
}

/** true when the colour has too little saturation to carry a hue (black, white, grey, silver) */
export const isNeutral = (hex: string, cfg: Cfg = C): boolean => toHsl(hex).s < cfg.neutralSaturation;

/** Readable version of a colour: hue kept; lightness and saturation pulled into the configured limits (dark -> lightened, very light -> lowered and slightly tinted). */
export function normalizeColor(hex: string, cfg: Cfg = C): string {
  const { h, s, l } = toHsl(hex);
  const light = l > cfg.lightnessMax;
  const sat = clamp(light ? Math.max(s, cfg.tintMinSaturation) : s, cfg.saturationMin, cfg.saturationMax);
  return fromHsl(h, sat, clamp(l, cfg.lightnessMin, cfg.lightnessMax));
}

/** first colour name of every product of the outfit as shown (top, bottom, shoes, accessories), one vote per product; unknown / multicolor = no vote */
export function outfitColorNames(o: Pick<FeedOutfit, "top" | "bottom" | "shoes" | "accessories">): string[] {
  const cards: (FeedCard | null | undefined)[] = [o.top, o.bottom, o.shoes, ...(o.accessories ?? []).map((a) => a.card)];
  const out: string[] = [];
  for (const c of cards) { const n = c?.mq?.col; if (n && COLOR_HEX[n]) out.push(n); }
  return out;
}

/** The gradient colours (hex, minColors..maxColors long) for a list of colour names: most frequent first, ties by order of appearance. Neutrals are dropped (or softened),
 *  the rest normalised; nothing clear left = the fallback colour for all slots. Fewer clear colours than `minColors` are padded with the fallback. */
export function stripePalette(names: readonly string[], cfg: Cfg = C): string[] {
  const count = new Map<string, number>();
  for (const n of names) if (COLOR_HEX[n]) count.set(n, (count.get(n) ?? 0) + 1);
  const ranked = [...count.entries()].map(([n, k], i) => ({ n, k, i })).sort((a, b) => b.k - a.k || a.i - b.i);
  const picked: string[] = [];
  for (const { n } of ranked) {
    const hex = COLOR_HEX[n];
    if (isNeutral(hex, cfg)) {
      if (cfg.dropNeutrals) continue;
      const f = rgb(cfg.fallbackColor), c = rgb(hex);
      picked.push(toHex(c.map((v, i) => v * (1 - cfg.neutralMix) + f[i] * cfg.neutralMix)));
    } else picked.push(normalizeColor(hex, cfg));
    if (picked.length >= cfg.maxColors) break;
  }
  while (picked.length < cfg.minColors) picked.push(cfg.fallbackColor);
  return picked;
}

export const outfitStripePalette = (o: Pick<FeedOutfit, "top" | "bottom" | "shoes" | "accessories">, cfg: Cfg = C): string[] => stripePalette(outfitColorNames(o), cfg);

/** CSS background of one gradient layer: soft radial colour blobs over a base linear gradient */
export function gradientCss(colors: readonly string[], cfg: Cfg = C): string {
  const r = Math.round(45 + cfg.softness * 55);   // blob radius in %
  const blobs = colors.map((c, i) => `radial-gradient(ellipse ${r}% ${r}% at ${cfg.blobs[i % cfg.blobs.length].x}% ${cfg.blobs[i % cfg.blobs.length].y}%, ${c} 0%, transparent 100%)`);
  return [...blobs, `linear-gradient(${cfg.angleDeg}deg, ${colors[0]} 0%, ${colors[colors.length - 1]} 100%)`, cfg.baseColor].join(", ");
}

/** One seamless flute layer built from the configured stops, repeated every `period` px; alphas scaled by k, pattern shifted sideways by `shift` px */
function fluteLayer(period: number, k: number, cfg: Cfg, shift = 0): string {
  const st = cfg.stops.map((s) => `${s.c === "w" ? "rgba(255,255,255" : "rgba(0,0,0"},${+Math.min(1, s.a * k).toFixed(4)}) ${+(shift + period * s.pos / 100).toFixed(3)}px`);
  return `repeating-linear-gradient(90deg, ${st.join(", ")})`;
}

/** CSS of the stripe overlay: main flute layer plus (optional) a fainter one with another period. `boost` / `shift` give the refracted copy inside the glass pieces. */
export function stripeCss(cfg: Cfg = C, boost = 1, shift = 0): string {
  const main = fluteLayer(cfg.periodPx, boost, cfg, shift);
  return cfg.secondEnabled ? `${fluteLayer(cfg.periodPx * cfg.secondPeriodMult, cfg.secondOpacityMult * boost, cfg, shift)}, ${main}` : main;
}

/** Top-left specular highlight (whole screen) */
export const specularCss = (cfg: Cfg = C, alpha: number = cfg.specular.alpha): string => `linear-gradient(${cfg.specular.angleDeg}deg, rgba(255,255,255,${alpha}) 0%, rgba(255,255,255,0) ${cfg.specular.endPct}%)`;

export type CurveSlice = { topPx: number; heightPx: number; deg: number; shiftPx: number };

/** The tilted bottom zone as slices from top to bottom: slice i is rotated by maxDeg x (i+1)/n about its top centre and shifted left by the drift of the slices above, so the stripes
 *  stay continuous (no corner, no gap) and leave the screen leaning left. Positions are measured from the top of the zone. */
export function curveSlices(cfg: Cfg = C): CurveSlice[] {
  const { zonePx, maxDeg, slices } = cfg.curve, h = zonePx / slices, out: CurveSlice[] = [];
  let drift = 0;
  for (let i = 0; i < slices; i++) {
    const deg = maxDeg * (i + 1) / slices;
    out.push({ topPx: i * h, heightPx: h, deg, shiftPx: drift ? -drift : 0 });
    drift += h * Math.tan(deg * Math.PI / 180);
  }
  return out;
}

/** Capsule radius: larger than any bar height, so the browser clamps it to half the height (full semicircle ends) */
export const CAPSULE_RADIUS = 9999;

/** CSS of one grey glass piece (header / tab bar): fill + specular + refracted stripes (boosted, shifted) + light edge, soft shadow, small radius */
export function glassPieceStyle(mode: StripeMode = "colorful", cfg: Cfg = C): React.CSSProperties {
  const g = cfg.glass, simple = mode === "simple";
  return {
    background: `${specularCss(cfg, g.specularAlpha)}, ${simple ? stripeCss(simpleCfg(cfg), g.stripeBoost, g.stripeShiftPx) : stripeCss(cfg, g.stripeBoost, g.stripeShiftPx)}, ${glassFill(mode, cfg)}`,
    boxShadow: `inset 0 0 0 ${g.edgeWidthPx}px ${g.edge}, ${g.shadow}`,
    borderRadius: g.capsule ? CAPSULE_RADIUS : g.radiusPx,
  };
}

/** Effective mode: ?stripe=0|1|simple link wins (1 = colorful, unknown values ignored), otherwise the Profile choice (device only, default off). */
export const effectiveStripe = (link: string | null, local: StripeMode): StripeMode => (link === "1" ? "colorful" : link === "0" ? "off" : link === "simple" ? "simple" : local);

/** Config view of the Simple mode: its own stripe stops (grey only, very faint), same period / second layer. */
const simpleCfg = (cfg: Cfg = C): Cfg => ({ ...cfg, stops: cfg.simple.stops as unknown as Cfg["stops"], secondOpacityMult: cfg.simple.secondOpacityMult });
export const simpleStripeCss = (cfg: Cfg = C): string => stripeCss(simpleCfg(cfg));
/** Simple background: soft vertical white -> very light grey gradient */
export const simpleBackgroundCss = (cfg: Cfg = C): string => `linear-gradient(180deg, ${cfg.simple.bgTop} 0%, ${cfg.simple.bgBottom} 100%)`;
/** Glass fill: colour of the mode, translucency shared (`glass.fillAlpha`) */
export const glassFill = (mode: StripeMode = "colorful", cfg: Cfg = C): string => `rgba(${mode === "simple" ? cfg.simple.glassRgb : cfg.glass.rgb},${cfg.glass.fillAlpha})`;
/** Simple background: soft organic grey blobs (light grey mostly, some darker) over the white-to-grey base. Seeded by the outfit id: same outfit = same blobs. */
export function greyBlobsCss(seed: string, cfg: Cfg = C): string {
  const g = cfg.simple.grey, rnd = seededRnd(hash32(`grey:${seed}`)), r = 45 + cfg.simple.grey.softness * 55;
  const blobs = Array.from({ length: Math.min(g.count, g.anchors.length) }, (_, i) => {
    const an = g.anchors[i], dark = i >= g.count - g.darkCount, grey = dark ? g.dark : g.light, a = dark ? g.darkAlpha : g.lightAlpha;
    const x = clamp(an.x + rnd() * 2 * g.jitterPct, 0, 100), y = clamp(an.y + rnd() * 2 * g.jitterPct, 0, 100);
    const rx = r * (0.6 + rnd() * g.stretch + 0.2) * 0.7, ry = r * (0.6 + rnd() * g.stretch + 0.2) * 0.7;
    const [R, G, B] = rgb(grey).map((v) => Math.round(v * 255));
    return `radial-gradient(ellipse ${rx.toFixed(1)}% ${ry.toFixed(1)}% at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(${R},${G},${B},${a}) 0%, rgba(${R},${G},${B},0) 100%)`;
  });
  return [...blobs, simpleBackgroundCss(cfg)].join(", ");
}
