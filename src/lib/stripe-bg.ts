// Liquid-glass background, pure logic (no React): outfit -> 2..3 readable colours -> CSS strings, plus the setting.
import { STRIPE_BG as C } from "@/config/stripe-bg";
import type React from "react";
import { COLOR_HEX } from "@/lib/shine";
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

/** One seamless flute layer built from the configured stops, repeated every `period` px; alphas scaled by k */
function fluteLayer(period: number, k: number, cfg: Cfg): string {
  const st = cfg.stops.map((s) => `${s.c === "w" ? "rgba(255,255,255" : "rgba(0,0,0"},${+(s.a * k).toFixed(4)}) ${+(period * s.pos / 100).toFixed(3)}px`);
  return `repeating-linear-gradient(90deg, ${st.join(", ")})`;
}

/** CSS of the stripe overlay: main flute layer plus (optional) a fainter one with another period */
export function stripeCss(cfg: Cfg = C): string {
  const main = fluteLayer(cfg.periodPx, 1, cfg);
  return cfg.secondEnabled ? `${fluteLayer(cfg.periodPx * cfg.secondPeriodMult, cfg.secondOpacityMult, cfg)}, ${main}` : main;
}

/** Panel box: insets, corner radius and outer shadow (top corners square unless roundTop) */
export function panelCss(cfg: Cfg = C): React.CSSProperties {
  const p = cfg.panel, r = `${p.radiusPx}px`;
  return {
    position: "absolute", left: p.gapSidePx, right: p.gapSidePx, bottom: p.gapBottomPx, top: p.roundTop ? p.gapTopPx : 0,
    borderRadius: p.roundTop ? r : `0 0 ${r} ${r}`, overflow: "hidden", boxShadow: cfg.edge.outerShadow,
  };
}

/** Glass edge overlay (drawn above the stripes): diagonal specular highlight + inset light border, refraction band and inner shadow */
export function edgeCss(cfg: Cfg = C): React.CSSProperties {
  const e = cfg.edge, w = (a: number) => `rgba(255,255,255,${a})`;
  const shadows = [`inset 0 0 0 ${e.borderWidthPx}px ${w(e.borderAlpha)}`, e.refractionEnabled ? `inset 0 0 ${e.refractionPx}px ${w(e.refractionAlpha)}` : "", e.innerShadow].filter(Boolean);
  return { borderRadius: "inherit", background: `linear-gradient(${e.specularAngleDeg}deg, ${w(e.specularAlpha)} 0%, ${w(0)} ${e.specularEnd}%)`, boxShadow: shadows.join(", ") };
}

/** Effective setting: ?stripe=0|1 link wins (testing), otherwise the Profile choice (device only, default off). */
export const effectiveStripe = (link: string | null, localOn: boolean): boolean => (link === "1" ? true : link === "0" ? false : localOn);
