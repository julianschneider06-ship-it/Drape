import type { FeedCard } from "../types";
import { MAX_CANVAS_W, SIZE, SRC, type GarmentClass } from "../layout/config";

/** Shopify CDN resizes on the fly with ?width=; other hosts are returned untouched. */
export function imgUrl(url: string, width: number): string {
  if (!url.includes("cdn.shopify.com")) return url;
  return url + (url.includes("?") ? "&" : "?") + `width=${width}`;
}

/** Price with the currency as stored (no conversion). */
export function formatPrice(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "USD" }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim(); }
}

/**
 * Blend a light-neutral backdrop into the white page: scale brightness by 255 / (lowest backdrop channel) so the
 * backdrop clips to pure white, then multiply onto the page. Pure white backdrops need nothing.
 */
export function blendStyle(c: Pick<FeedCard, "bg">): React.CSSProperties {
  let filter: string | undefined;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.bg ?? "");
  if (m) {
    const min = Math.min(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
    if (min >= 200 && min < 252) filter = `brightness(${Math.min(1.3, 255 / min).toFixed(3)})`;
  }
  return { mixBlendMode: "multiply", filter };
}

/** Geometry of the crop-to-content layout (all numbers in image-height units). */
export function cropGeometry(c: Pick<FeedCard, "bbox" | "aspect">) {
  if (!c.bbox || !c.aspect) return null;
  const [x0, y0, x1, y1] = c.bbox;
  const A = c.aspect, cw = (x1 - x0) * A, ch = y1 - y0;
  if (cw <= 0.01 || ch <= 0.01) return null;
  return { A, cw, ch, cx: ((x0 + x1) / 2) * A, cy: (y0 + y1) / 2 };
}

/** Image URL sized for the crop: zoomed-in crops need more source pixels than the plain image. */
export function feedSrc(c: FeedCard & { cut?: boolean }, cls: GarmentClass): string {
  if (c.cut) return c.image;                  // cutouts are stored at display size (max 900 px)
  if (!c.bbox) return imgUrl(c.image, SRC.fallback);
  const frac = Math.max(0.2, c.bbox[2] - c.bbox[0]);
  const w = Math.round((SIZE[cls].maxW * MAX_CANVAS_W * SRC.dpr) / frac / 100) * 100;
  return imgUrl(c.image, Math.min(SRC.max, Math.max(SRC.min, w)));
}

/** "auto" = cutout when available (default), "off" = always the original photo (debug: ?cut=off). */
export type CutMode = "auto" | "off";

/**
 * What the feed actually draws for a product: the transparent cutout when it exists (its own file is already cropped to the
 * content, so bbox = whole image), otherwise the original photo with its content box + multiply blend.
 */
export function viewCard(c: FeedCard, mode: CutMode): FeedCard & { cut: boolean } {
  if (mode === "auto" && c.cutout && c.cutout_aspect) return { ...c, image: c.cutout, bbox: [0, 0, 1, 1], aspect: c.cutout_aspect, bg: null, cut: true };
  return { ...c, cut: false };
}
