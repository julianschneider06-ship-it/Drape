// Outfit preview, pure logic (no React): the outfit's pieces -> the colours of the pixel figure, plus the setting and the horizontal position.
// The figure is built from fixed pixel templates (src/config/pixel-figure.ts); the outfit only picks which template applies (by category) and the colours.
import { MANNEQUIN as C } from "@/config/mannequin";
import { BAG_TYPES, FACE_BY_TYPE, HEAD_BY_TYPE, PIXEL_COLORS, TORSO_BY_CATEGORY, TORSO_FALLBACK, type TorsoKey } from "@/config/pixel-figure";
import { navTabs } from "@/lib/nav-tabs";
import type { FigureSpec } from "@/lib/pixel-figure";
import { COLOR_HEX } from "@/lib/shine";
import type { FeedCard, FeedOutfit } from "@/lib/types";

export type MannequinSpec = FigureSpec;

/** first colour of the piece as a flat fill; missing, unknown or multicolor = null */
export const pieceHex = (c: FeedCard | null | undefined): string | null => COLOR_HEX[c?.mq?.col ?? ""] ?? null;
/** same, grey when there is no plain colour (used for headwear and bags, which are drawn anyway) */
export const pieceColor = (c: FeedCard | null | undefined): string => pieceHex(c) ?? C.fallbackColor;

/** Template key of the top item: its classification subcategory (lower-case, spaces / hyphens normalised) through `TORSO_BY_CATEGORY`; unknown or missing = `TORSO_FALLBACK`. */
export const torsoKey = (c: FeedCard | null | undefined): TorsoKey => {
  const sub = (c?.mq?.sub ?? "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return Object.prototype.hasOwnProperty.call(TORSO_BY_CATEGORY, sub) ? TORSO_BY_CATEGORY[sub] : TORSO_FALLBACK;
};

/** Colours and templates of the outfit as shown (after swaps). A one-piece (dress, jumpsuit) colours both top and bottom; an outer layer without another top is the top itself.
 *  Missing colours use the fixed fallbacks. Templates: torso from the top's category, head from the first cap / beanie / hat, face from the first sunglasses / glasses
 *  (all via the lookup tables in src/config/pixel-figure.ts); the first bag is the bag; everything else is ignored. */
export function mannequinSpec(o: Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">, gender: "men" | "women" = "men"): MannequinSpec {
  const full = o.kind === "full" || o.top.slot === "full_body", F = PIXEL_COLORS.fallback;
  let head: string | null = null, bag: string | null = null, headType: MannequinSpec["headType"] = null, face: MannequinSpec["face"] = null, hasBag = false;
  for (const a of o.accessories ?? []) {
    if (!headType && HEAD_BY_TYPE[a.type]) { headType = HEAD_BY_TYPE[a.type]; head = pieceColor(a.card); }
    else if (!face && FACE_BY_TYPE[a.type]) face = FACE_BY_TYPE[a.type];
    else if (!hasBag && BAG_TYPES.includes(a.type)) { hasBag = true; bag = pieceColor(a.card); }
  }
  const top = pieceHex(o.top) ?? F.top;
  return { top, bottom: full ? top : pieceHex(o.bottom) ?? F.bottom, shoes: pieceHex(o.shoes) ?? F.shoes, head, bag, torso: torsoKey(o.top), headType, face, ...(gender === "women" ? { gender } : {}) };
}

/** Effective setting: ?mini=0|1 link wins (testing), otherwise the Profile choice (device only, default on). */
export const effectiveMini = (link: string | null, localOn: boolean): boolean => (link === "1" ? true : link === "0" ? false : localOn);

/** Left edge of the figure (px from the layer's left edge): centred over the `anchorTab` (Profile) of the bottom bar, then kept `safeMarginPx` away from both screen edges.
 *  The bar has equal-width tabs and is at most `barMaxWidthPx` wide. */
export function figureLeft(layerWidth: number, searchOn: boolean, figureWidth: number): number {
  const tabs = navTabs(searchOn), barW = Math.min(layerWidth, C.barMaxWidthPx);
  const centre = (layerWidth - barW) / 2 + barW * ((tabs.indexOf(C.anchorTab) + 0.5) / tabs.length);
  const left = Math.round(centre - figureWidth / 2 + C.xShiftPx);
  return Math.max(C.safeMarginPx, Math.min(layerWidth - C.safeMarginPx - figureWidth, left));
}
export const figureWidth = (): number => Math.round((C.heightPx * C.view.w) / C.view.h);
