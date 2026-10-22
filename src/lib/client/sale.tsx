"use client";
import { SALE_MARKER_ENABLED } from "@/lib/layout/config";
import type { FeedCard } from "@/lib/types";

/** Red hand-drawn outline on products on sale. One switch: app_settings.sale_marker_enabled (code default SALE_MARKER_ENABLED in config.ts); ?sale=off / ?sale=on override it. */
let saleDefault = SALE_MARKER_ENABLED;   // the live default comes from app_settings (set by Feed from the server)
export const setSaleDefault = (v: boolean | undefined) => { if (typeof v === "boolean") saleDefault = v; };
export function saleMarkerOn(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("sale");
  return q === "on" ? true : q === "off" ? false : saleDefault;
}
export const isOnSale = (c: FeedCard) => !!c.compare_at_cents && c.compare_at_cents > (c.price_cents ?? 0);

/** Outline size class from the piece's width as a share of the canvas: large items get a ~2px line, small ones never thinner than ~1.5px. */
export const saleSize = (wShare: number): "s" | "m" | "l" => (wShare >= 0.3 ? "l" : wShare >= 0.15 ? "m" : "s");

/** SVG filters (defined once): dilate the silhouette, wobble it with noise, keep only the ring and paint it red under the image. */
export const RING: Record<"s" | "m" | "l", { grow: number; core: number; wobble: number }> = {
  l: { grow: 2.6, core: 0.5, wobble: 3.2 },   // ~2px line + wobble
  m: { grow: 2.3, core: 0.6, wobble: 2.8 },
  s: { grow: 2.1, core: 0.6, wobble: 2.4 },   // ~1.5px line
};
export function SaleInkDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      {(Object.keys(RING) as ("s" | "m" | "l")[]).map((k) => (
        // wide filter region so the outline is not cut flat at the image box
        <filter key={k} id={`drape-sale-ink-${k}`} x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={RING[k].grow} result="grown" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="grown" in2="noise" scale={RING[k].wobble} xChannelSelector="R" yChannelSelector="G" result="wobbly" />
          <feMorphology in="SourceAlpha" operator="dilate" radius={RING[k].core} result="core" />
          <feComposite in="wobbly" in2="core" operator="out" result="ring" />
          <feFlood floodColor="#e0221b" result="red" />
          <feComposite in="red" in2="ring" operator="in" result="ink" />
          <feMerge><feMergeNode in="ink" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      ))}
    </svg>
  );
}

