"use client";
import { useLayerFade } from "@/lib/use-layer-fade";

/** A panel that stays mounted and crossfades when shown / hidden (tab content, Search configurator <-> results). Animation state stays inside; children do not re-render. */
export default function Layer({ active, appear, shiftPx, className, style, children }: {
  active: boolean; appear?: boolean; shiftPx?: number; className?: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const ref = useLayerFade<HTMLDivElement>(active, { appear, shiftPx });
  return <div ref={ref} className={className} style={style}>{children}</div>;
}
