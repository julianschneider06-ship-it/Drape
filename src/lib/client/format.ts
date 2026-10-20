import type { FeedCard } from "../types";

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

/** Typical slot size in px, used only to pick a sensible image width to request. */
const SLOT_W = 320, SLOT_H = 240;

/** Geometry of the crop-to-content layout (all numbers in image-height units). */
export function cropGeometry(c: Pick<FeedCard, "bbox" | "aspect">) {
  if (!c.bbox || !c.aspect) return null;
  const [x0, y0, x1, y1] = c.bbox;
  const A = c.aspect, cw = (x1 - x0) * A, ch = y1 - y0;
  if (cw <= 0.01 || ch <= 0.01) return null;
  return { A, cw, ch, cx: ((x0 + x1) / 2) * A, cy: (y0 + y1) / 2 };
}

/** Image URL sized for the crop (zoomed images need more source pixels than a plain contain). */
export function feedSrc(c: FeedCard, tall = false, minW = 480): string {
  const g = cropGeometry(c);
  if (!g) return imgUrl(c.image, 700);
  const k = Math.min((0.92 * SLOT_W) / g.cw, (0.92 * SLOT_H * (tall ? 2 : 1)) / g.ch); // px per image height
  const w = Math.min(1100, Math.max(minW, Math.round((g.A * k * 1.6) / 100) * 100));
  return imgUrl(c.image, w);
}
