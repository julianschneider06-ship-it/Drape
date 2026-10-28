"use client";
import { memo, useMemo } from "react";
import { MANNEQUIN as C } from "@/config/mannequin";
import { figureLeft, figureWidth, type MannequinSpec } from "@/lib/mannequin";
import { mannequinArt } from "@/lib/mannequin-art";

/** The outfit preview figure of one outfit (inline SVG, static, pointer-events none). Position: centred over the Wishlist tab, feet just above the bottom bar. */
function Mannequin({ spec, layerWidth, searchOn }: { spec: MannequinSpec; layerWidth: number; searchOn: boolean }) {
  const parts = useMemo(() => mannequinArt(spec), [spec]);
  if (!(layerWidth > 0)) return null;
  const w = figureWidth();
  return (
    <svg className="pointer-events-none absolute" style={{ left: figureLeft(layerWidth, searchOn, w), bottom: `calc(var(--safe-b, 0px) + ${C.bottomGapPx}px)`, opacity: C.opacity }}
      width={w} height={C.heightPx} viewBox={`0 0 ${C.view.w} ${C.view.h}`} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {parts.map((p) => <path key={p.key} d={p.d} fill={p.fill} stroke={C.line.color} strokeWidth={C.line.width} />)}
    </svg>
  );
}
export default memo(Mannequin);
