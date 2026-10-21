"use client";
import { SALE_MARKER_ENABLED } from "@/lib/layout/config";
import type { FeedCard } from "@/lib/types";

/** Red hand-drawn outline on products on sale. One switch: SALE_MARKER_ENABLED in config.ts; ?sale=off / ?sale=on override it. */
export function saleMarkerOn(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("sale");
  return q === "on" ? true : q === "off" ? false : SALE_MARKER_ENABLED;
}
export const isOnSale = (c: FeedCard) => !!c.compare_at_cents && c.compare_at_cents > (c.price_cents ?? 0);

/** SVG filter (defined once): dilates the silhouette, wobbles it with noise, keeps only the ring around the product and paints it red under the image. */
export function SaleInkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id="drape-sale-ink" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="grown" />
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="grown" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.8" result="core" />
        <feComposite in="wobbly" in2="core" operator="out" result="ring" />
        <feFlood floodColor="#e0221b" result="red" />
        <feComposite in="red" in2="ring" operator="in" result="ink" />
        <feMerge><feMergeNode in="ink" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </svg>
  );
}
