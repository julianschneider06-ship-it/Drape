// Price tag next to the searched piece in Search results (display only). Pure: text, size and position; the drawing lives in OutfitCanvas.
import { PRICE_TAG } from "@/config/search";
import { LAYOUT_SAFE_MARGIN } from "@/config/layout-safe";
import { formatPrice } from "@/lib/client/format";
import type { Rect } from "@/lib/layout/engine";

/** ?price=0 hides the tag (link only; anything else = on) */
export const priceTagOn = (search: string): boolean => new URLSearchParams(search).get("price") !== "0";

/** Text of the tag: the product's CURRENT price (price_cents is already the sale price on sale items) in the currency stored with it, no conversion. null = no price, no tag. */
export function priceTagText(card: { price_cents: number | null; currency: string | null }): string | null {
  if (card.price_cents == null || !(card.price_cents > 0)) return null;
  return formatPrice(card.price_cents, card.currency);
}

export const priceTagSize = (text: string, scale = 1, cfg = PRICE_TAG) => ({
  w: (text.length * cfg.fontPx * cfg.charEm + 2 * cfg.padX) * scale,
  h: (cfg.fontPx * 1.2 + 2 * cfg.padY) * scale,
});

/** Preferred spot: just below the lower-left corner of the piece. */
export const preferredTagRect = (piece: Rect, size: { w: number; h: number }, cfg = PRICE_TAG): Rect =>
  ({ x: piece.x + cfg.offsetX, y: piece.y + piece.h + cfg.gap + cfg.offsetY, w: size.w, h: size.h });

const hit = (a: Rect, b: Rect, pad: number) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

export type TagPlacement = { rect: Rect; scale: number; spot: "below" | "left" | "below-nudged" | "inside" };

/** Final spot, fully inside the card and the safe area, never over another piece (or the sale label): below the lower-left corner, else left of it,
 *  else slid along the lower edge, else inside the piece's own lower-left corner (it is the searched piece itself, so nothing else is hidden).
 *  Shrinks down to cfg.minScale when needed; null = no spot at all (the tag is left out). */
export function placePriceTag(text: string, piece: Rect, obstacles: Rect[], canvas: { w: number; h: number }, safe = LAYOUT_SAFE_MARGIN, cfg = PRICE_TAG): TagPlacement | null {
  const side = 2, top = safe.top, bottom = canvas.h - safe.bottom;
  for (const scale of [1, 0.9, 0.8, cfg.minScale]) {
    if (scale < cfg.minScale - 1e-9) break;
    const sz = priceTagSize(text, scale, cfg), g = cfg.gap;
    const ok = (r: Rect) => r.x >= side && r.x + r.w <= canvas.w - side && r.y >= top && r.y + r.h <= bottom && !obstacles.some((o) => hit(r, o, 1));
    const cands: [TagPlacement["spot"], Rect][] = [
      ["below", preferredTagRect(piece, sz, cfg)],
      ["left", { x: piece.x - sz.w - g, y: piece.y + piece.h - sz.h, w: sz.w, h: sz.h }],
    ];
    for (let k = 1; k <= 8; k++) cands.push(["below-nudged", { x: piece.x + (k * piece.w) / 8, y: piece.y + piece.h + g, w: sz.w, h: sz.h }]);
    cands.push(["inside", { x: piece.x + 2, y: piece.y + piece.h - sz.h - 2, w: sz.w, h: sz.h }]);
    for (const [spot, rect] of cands) if (ok(rect)) return { rect, scale, spot };
  }
  return null;
}
