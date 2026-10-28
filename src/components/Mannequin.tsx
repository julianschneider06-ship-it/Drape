"use client";
import { memo, useMemo } from "react";
import { MANNEQUIN as C } from "@/config/mannequin";
import { figureLeft, figureWidth, type MannequinSpec } from "@/lib/mannequin";
import { figureMarkup } from "@/lib/pixel-figure";

/** The outfit preview figure of one outfit (pixel-art inline SVG, static, pointer-events none). Position: centred over the Wishlist tab, feet just above the bottom bar. */
function Mannequin({ spec, layerWidth, searchOn }: { spec: MannequinSpec; layerWidth: number; searchOn: boolean }) {
  const html = useMemo(() => figureMarkup(spec), [spec]);
  if (!(layerWidth > 0)) return null;
  const w = figureWidth();
  return (
    <svg className="pointer-events-none absolute" style={{ left: figureLeft(layerWidth, searchOn, w), bottom: `calc(var(--safe-b, 0px) + ${C.bottomGapPx}px)`, opacity: C.opacity }}
      width={w} height={C.heightPx} viewBox={`0 0 ${C.view.w} ${C.view.h}`} shapeRendering="crispEdges" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
  );
}
export default memo(Mannequin);
