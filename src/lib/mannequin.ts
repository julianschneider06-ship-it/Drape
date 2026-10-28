// Outfit preview, pure logic (no React): the outfit's pieces -> the colours of the pixel figure, plus the setting and the horizontal position.
// The figure is built from fixed pixel templates (src/config/pixel-figure.ts); the outfit only picks which template applies (by category) and the colours.
import { MANNEQUIN as C } from "@/config/mannequin";
import { BAG_TYPES, FACE_BY_TYPE, HEAD_BY_TYPE, HEAD_KEYWORDS, PATTERN_BY_ATTR, PATTERN_KEYWORDS, PIXEL_COLORS, SHORTS_CATEGORIES, SHORTS_KEYWORDS, TORSO_BY_CATEGORY, TORSO_FALLBACK, TORSO_KEYWORDS, type HeadKey, type LegsKey, type PatternKey, type TorsoKey } from "@/config/pixel-figure";
import { navTabs } from "@/lib/nav-tabs";
import type { FigureSpec } from "@/lib/pixel-figure";
import { COLOR_HEX } from "@/lib/shine";
import type { FeedCard, FeedOutfit } from "@/lib/types";

export type MannequinSpec = FigureSpec;

/** first colour of the piece as a flat fill; missing, unknown or multicolor = null */
export const pieceHex = (c: FeedCard | null | undefined): string | null => COLOR_HEX[c?.mq?.col ?? ""] ?? null;
/** same, grey when there is no plain colour (used for headwear and bags, which are drawn anyway) */
export const pieceColor = (c: FeedCard | null | undefined): string => pieceHex(c) ?? C.fallbackColor;

const norm = (v: string | null | undefined): string => (v ?? "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const has = (title: string, words: readonly string[]): boolean => words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[-\s]+/g, "[- ]?")}($|[^a-z])`).test(title));
/** first row of a keyword table whose words occur in the title, or null */
export const keywordKey = <K extends string>(table: readonly (readonly [K, readonly string[]])[], title: string | null | undefined): K | null => {
  const t = (title ?? "").toLowerCase();
  for (const [key, words] of table) if (has(t, words)) return key;
  return null;
};
const known = (sub: string, table: Readonly<Record<string, unknown>>) => Object.prototype.hasOwnProperty.call(table, sub);

/** Template key of the top item: its classification subcategory (lower-case, spaces / hyphens normalised) through `TORSO_BY_CATEGORY`; an unlisted category tries the title keywords, then `TORSO_FALLBACK`. */
export const torsoKey = (c: FeedCard | null | undefined): TorsoKey => {
  const sub = norm(c?.mq?.sub);
  return known(sub, TORSO_BY_CATEGORY) ? TORSO_BY_CATEGORY[sub] : keywordKey(TORSO_KEYWORDS, c?.name) ?? TORSO_FALLBACK;
};

/** Legs template of the bottom: shorts when its category is in `SHORTS_CATEGORIES` or its title has a `SHORTS_KEYWORDS` word, else trousers. */
export const legsKey = (c: FeedCard | null | undefined): LegsKey =>
  SHORTS_CATEGORIES.has(norm(c?.mq?.sub)) || has((c?.name ?? "").toLowerCase(), SHORTS_KEYWORDS) ? "shorts" : "trousers";

/** Head template of a head accessory: the type through `HEAD_BY_TYPE`; a "hat" whose title says cap / beanie (`HEAD_KEYWORDS`) becomes that, so a cap never gets the all-around hat brim. */
export const headKey = (type: string, name: string | null | undefined): Exclude<HeadKey, "none"> | null => {
  const k = known(type, HEAD_BY_TYPE) ? HEAD_BY_TYPE[type] : null;
  return k === "hat" ? keywordKey(HEAD_KEYWORDS, name) ?? "hat" : k;
};

/** Pattern overlay of the top: the classification pattern through `PATTERN_BY_ATTR` ("solid" = none); a value that is missing or not listed uses the title keywords; none found = solid (null). */
export const patternKey = (c: FeedCard | null | undefined): PatternKey | null => {
  const attr = norm(c?.mq?.pat);
  if (known(attr, PATTERN_BY_ATTR)) { const k = PATTERN_BY_ATTR[attr]; return k === "solid" ? null : k; }
  return keywordKey(PATTERN_KEYWORDS, c?.name);
};

/** Colours and templates of the outfit as shown (after swaps). A one-piece (dress, jumpsuit) colours both top and bottom; an outer layer without another top is the top itself.
 *  Missing colours use the fixed fallbacks. Templates: torso from the top's category, head from the first cap / beanie / hat, face from the first sunglasses / glasses
 *  (all via the lookup tables in src/config/pixel-figure.ts); the first bag is the bag; everything else is ignored. */
export function mannequinSpec(o: Pick<FeedOutfit, "kind" | "top" | "bottom" | "shoes" | "accessories">, gender: "men" | "women" = "men"): MannequinSpec {
  const full = o.kind === "full" || o.top.slot === "full_body", F = PIXEL_COLORS.fallback;
  let head: string | null = null, bag: string | null = null, headType: MannequinSpec["headType"] = null, face: MannequinSpec["face"] = null, hasBag = false;
  for (const a of o.accessories ?? []) {
    if (!headType && headKey(a.type, a.card?.name)) { headType = headKey(a.type, a.card?.name); head = pieceColor(a.card); }
    else if (!face && FACE_BY_TYPE[a.type]) face = FACE_BY_TYPE[a.type];
    else if (!hasBag && BAG_TYPES.includes(a.type)) { hasBag = true; bag = pieceColor(a.card); }
  }
  const top = pieceHex(o.top) ?? F.top, pattern = patternKey(o.top), accent = pattern ? COLOR_HEX[o.top.mq?.col2 ?? ""] ?? null : null;
  return { top, bottom: full ? top : pieceHex(o.bottom) ?? F.bottom, shoes: pieceHex(o.shoes) ?? F.shoes, head, bag, torso: torsoKey(o.top), headType, face, ...(!full && o.bottom && legsKey(o.bottom) === "shorts" ? { legs: "shorts" as const } : {}), ...(pattern ? { pattern, accent } : {}), ...(gender === "women" ? { gender } : {}) };
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
