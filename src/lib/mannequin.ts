// Outfit preview, pure logic (no React): the outfit's pieces -> the colours of the pixel figure, plus the setting and the horizontal position.
// The figure has one fixed shape (src/lib/pixel-figure.ts); only the colours and the optional headwear / bag come from the outfit.
import { MANNEQUIN as C } from "@/config/mannequin";
import { PIXEL_COLORS } from "@/config/pixel-figure";
import { navTabs } from "@/lib/nav-tabs";
import type { FigureSpec } from "@/lib/pixel-figure";
import { COLOR_HEX } from "@/lib/shine";
import type { FeedCard, FeedOutfit } from "@/lib/types";

export type MannequinSpec = FigureSpec;

/** first colour of the piece as a flat fill; missing, unknown or multicolor = null */
export const pieceHex = (c: FeedCard | null | undefined): string | null => COLOR_HEX[c?.mq?.col ?? ""] ?? null;
/** same, grey when there is no plain colour (used for headwear and bags, which are drawn anyway) */
export const pieceColor = (c: FeedCard | null | undefined): string => pieceHex(c) ?? C.fallbackColor;

/** Colours of the outfit as shown (after swaps). A one-piece (dress, jumpsuit) colours both top and bottom; an outer layer without another top is the top itself.
 *  Missing colours use the fixed fallbacks. Any headwear is the beanie; the first bag is the bag; everything else is ignored. */
export function mannequinSpec(o: Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">): MannequinSpec {
  const full = o.kind === "full" || o.top.slot === "full_body", F = PIXEL_COLORS.fallback;
  let head: string | null = null, bag: string | null = null, hasHead = false, hasBag = false;
  for (const a of o.accessories ?? []) {
    if (!hasHead && (a.type === "cap" || a.type === "hat" || a.type === "beanie")) { hasHead = true; head = pieceColor(a.card); }
    else if (!hasBag && (a.type === "bag" || a.type === "backpack")) { hasBag = true; bag = pieceColor(a.card); }
  }
  const top = pieceHex(o.top) ?? F.top;
  return { top, bottom: full ? top : pieceHex(o.bottom) ?? F.bottom, shoes: pieceHex(o.shoes) ?? F.shoes, head, bag };
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
