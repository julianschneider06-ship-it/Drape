// Picture veil (Prompt 96), pure logic: setting + shown parts -> veil colour and opacity. No React. Numbers in src/config/background-images.ts.
import { DYN_DARK_BELOW, DYN_LIGHT_ABOVE, DYN_MAX_STRENGTH, DYN_MIN_STRENGTH, VEIL, VEIL_MAX, VEIL_STRENGTH } from "../config/background-images";
import { luminance } from "./pixel-figure";
import { COLOR_HEX } from "./shine";
import type { VeilMode } from "./shop-pref";
import type { FeedOutfit } from "./types";

export type VeilColor = "white" | "black";
export interface VeilCounts { dark: number; light: number; mid: number }
export interface VeilResult { mode: VeilMode; color: VeilColor; opacity: number; counts: VeilCounts | null; override: boolean; reason: string }

/** relative luminance (0..1) of a colour NAME (first `colors` entry); unknown / multicolor / missing = null */
export const partLuminance = (name: string | null | undefined): number | null => { const h = name ? COLOR_HEX[name] : undefined; return h ? luminance(h) : null; };
export type PartClass = "dark" | "light" | "mid";
/** unknown colour counts as mid */
export const classifyPart = (lum: number | null): PartClass => (lum === null ? "mid" : lum < DYN_DARK_BELOW ? "dark" : lum > DYN_LIGHT_ABOVE ? "light" : "mid");

/** first colour name of every SHOWN part (top, bottom, shoes, accessories; missing cards are not parts), undefined = part without a known colour. Greyed parts still count. */
export function outfitPartColors(o: Pick<FeedOutfit, "top" | "bottom" | "shoes" | "accessories"> | null | undefined): (string | undefined)[] {
  if (!o) return [];
  const cards = [o.top, o.bottom, o.shoes, ...(o.accessories ?? []).map((a) => a.card)];
  return cards.filter((c) => !!c && c.id > 0).map((c) => c!.mq?.col || undefined);
}

/** Dynamic rule: more dark parts -> white veil, more light parts -> black veil, tie (also nothing shown / all mid) -> none. Strength MIN + (MAX - MIN) * |d - l| / n. */
export function dynamicVeil(names: readonly (string | null | undefined)[]): { color: VeilColor; opacity: number; counts: VeilCounts } {
  const counts: VeilCounts = { dark: 0, light: 0, mid: 0 };
  for (const n of names) counts[classifyPart(partLuminance(n))]++;
  const n = names.length, d = counts.dark, l = counts.light;
  if (n === 0 || d === l) return { color: "white", opacity: 0, counts };
  return { color: d > l ? "white" : "black", opacity: DYN_MIN_STRENGTH + (DYN_MAX_STRENGTH - DYN_MIN_STRENGTH) * (Math.abs(d - l) / n), counts };
}

/** the veil as drawn. Order of precedence: debug link (?bgveil / ?bgveilcolor) > setting. No veil unless a picture is drawn (Pictures mode). */
export function resolveVeil(a: { mode: VeilMode; names: readonly (string | null | undefined)[]; pictureOn: boolean; debug: { opacity?: number | null; color?: VeilColor | null } }): VeilResult {
  const hasDbg = a.debug.opacity != null || a.debug.color != null;
  const base = a.mode === "off" ? { color: "white" as VeilColor, opacity: 0, counts: null as VeilCounts | null }
    : a.mode === "light" ? { color: "white" as VeilColor, opacity: VEIL_STRENGTH, counts: null }
    : a.mode === "dark" ? { color: "black" as VeilColor, opacity: VEIL_STRENGTH, counts: null }
    : dynamicVeil(a.names);
  const counts = a.mode === "dynamic" ? (base.counts ?? null) : null;
  if (!a.pictureOn) return { mode: a.mode, color: base.color, opacity: 0, counts, override: hasDbg, reason: "no picture" };
  if (hasDbg) {
    const o = a.debug.opacity != null ? Math.min(VEIL_MAX, Math.max(0, a.debug.opacity)) : VEIL.opacity;
    return { mode: a.mode, color: a.debug.color ?? VEIL.color, opacity: o, counts, override: true, reason: "debug override" };
  }
  return { mode: a.mode, color: base.color, opacity: base.opacity, counts, override: false, reason: a.mode };
}

/** ?bgveil=<0..0.8> / ?bgveilcolor=white|black, null = not given or invalid */
export function parseVeilDebug(search: string): { opacity: number | null; color: VeilColor | null } {
  const q = new URLSearchParams(search), o = q.get("bgveil"), c = q.get("bgveilcolor"), n = o !== null && o.trim() !== "" ? Number(o) : NaN;
  return { opacity: Number.isFinite(n) ? Math.min(VEIL_MAX, Math.max(0, n)) : null, color: c === "white" || c === "black" ? c : null };
}

/** Profile control state: only usable with Pictures (and at least one image); otherwise greyed out with a caption */
export const veilControlEnabled = (season: string, noImages: boolean): boolean => season === "pictures" && !noImages;
