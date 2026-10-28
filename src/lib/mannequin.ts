// Outfit preview, pure logic (no React): the outfit's pieces -> a small spec of variants and colours, plus the setting and the horizontal position.
// Variants come from fields the cards already carry (`name`, `hood`, `slot`, and `mq` = classification hints); missing data = the default variant.
import { MANNEQUIN as C } from "@/config/mannequin";
import { navTabs } from "@/lib/nav-tabs";
import { COLOR_HEX } from "@/lib/shine";
import type { FeedCard, FeedOutfit } from "@/lib/types";

export type ShoeKind = "low" | "high";
export type BottomShape = "short" | "wide" | "slim";
export type TopShape = "short" | "long" | "dress";
export type HeadKind = "cap" | "hat" | "beanie";
export interface MannequinSpec {
  shoes: { kind: ShoeKind; color: string };
  bottom: { shape: BottomShape; color: string } | null;   // null = a dress covers it
  top: { shape: TopShape; hood: boolean; hem: "short" | "long"; color: string };   // hem only matters for a dress
  head: { kind: HeadKind; color: string } | null;
  glasses: boolean;
  bag: { color: string } | null;
}

const text = (c: FeedCard | null | undefined) => `${c?.mq?.sub ?? ""} ${c?.name ?? ""}`.toLowerCase();
/** first colour of the piece as a flat fill; missing, unknown or multicolor = neutral grey */
export const pieceColor = (c: FeedCard | null | undefined): string => COLOR_HEX[c?.mq?.col ?? ""] ?? C.fallbackColor;

const HIGH_SHOE = /\b(boots?|bootie|booties|chelsea|combat|hi-?tops?|high[- ]?tops?|ankle|hiking|wellies|wellingtons)\b/;
export const shoeKind = (c: FeedCard | null | undefined): ShoeKind => (HIGH_SHOE.test(text(c)) ? "high" : c ? "low" : C.defaults.shoes);

const SHORT_BOTTOM = /\b(shorts?|skort|bermuda|mini)\b/, WIDE_BOTTOM = /\b(wide|flare[ds]?|palazzo|culottes?|baggy|cargo|parachute|barrel|skirt|relaxed|loose)\b/;
export function bottomShape(c: FeedCard | null | undefined): BottomShape {
  if (!c) return C.defaults.bottom;
  const t = text(c);
  if (SHORT_BOTTOM.test(t)) return "short";
  if (WIDE_BOTTOM.test(t) || c.mq?.fit === "loose" || c.mq?.fit === "oversized" || ["relaxed", "oversized", "flared", "a_line", "boxy"].includes(c.mq?.sil ?? "")) return "wide";
  if (/\b(slim|skinny|tapered|straight|legging|jeans|chinos?)\b/.test(t) || c.mq?.fit === "slim" || ["slim", "tapered", "straight"].includes(c.mq?.sil ?? "")) return "slim";
  return C.defaults.bottom;
}

const SHORT_TOP = /\b(tee|t-?shirt|tank|cami|camisole|polo|short[- ]?sleeves?|sleeveless|crop(ped)?|bodysuit|vest|singlet|bandeau)\b/, LONG_SLEEVE = /\blong[- ]?sleeves?\b/;
const HOOD = /\bhood(ed|ie|y)?\b/;
/** short sleeve / long sleeve (outer layers count as long sleeve in their own colour) / dress (full-body piece) */
export function topSpec(c: FeedCard, full: boolean): MannequinSpec["top"] {
  const t = text(c), color = pieceColor(c), hood = c.hood === true || HOOD.test(t);
  if (full) return { shape: "dress", hood: false, hem: /\b(midi|maxi|long|gown)\b/.test(t) ? "long" : /\b(mini|short)\b/.test(t) ? "short" : C.defaults.dressHem, color };
  const shape: TopShape = c.mq?.outer || LONG_SLEEVE.test(t) || hood ? "long" : SHORT_TOP.test(t) ? "short" : C.defaults.top;
  return { shape, hood, hem: C.defaults.dressHem, color };
}

/** Spec of the outfit as shown (after swaps). Other accessories are ignored; at most one head item, glasses and bag are drawn. */
export function mannequinSpec(o: Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">): MannequinSpec {
  const full = o.kind === "full" || o.top.slot === "full_body";
  let head: MannequinSpec["head"] = null, glasses = false, bag: MannequinSpec["bag"] = null;
  for (const a of o.accessories ?? []) {
    if (!head && (a.type === "cap" || a.type === "hat" || a.type === "beanie")) head = { kind: a.type, color: pieceColor(a.card) };
    else if (a.type === "sunglasses" || a.type === "glasses") glasses = true;
    else if (!bag && (a.type === "bag" || a.type === "backpack")) bag = { color: pieceColor(a.card) };
  }
  return {
    shoes: { kind: shoeKind(o.shoes), color: pieceColor(o.shoes) },
    bottom: full ? null : { shape: bottomShape(o.bottom), color: pieceColor(o.bottom) },
    top: topSpec(o.top, full), head, glasses, bag,
  };
}

/** Effective setting: ?mini=0|1 link wins (testing), otherwise the Profile choice (device only, default on). */
export const effectiveMini = (link: string | null, localOn: boolean): boolean => (link === "1" ? true : link === "0" ? false : localOn);

/** Left edge of the figure (px from the layer's left edge): centred over the Wishlist tab of the bottom bar. The bar has equal-width tabs and is at most `barMaxWidthPx` wide. */
export function figureLeft(layerWidth: number, searchOn: boolean, figureWidth: number): number {
  const tabs = navTabs(searchOn), barW = Math.min(layerWidth, C.barMaxWidthPx);
  const centre = (layerWidth - barW) / 2 + barW * ((tabs.indexOf("likes") + 0.5) / tabs.length);
  return Math.round(centre - figureWidth / 2 + C.xShiftPx);
}
export const figureWidth = (): number => Math.round((C.heightPx * C.view.w) / C.view.h);
