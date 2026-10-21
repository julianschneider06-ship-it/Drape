"use client";
import { useMemo } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import { cropGeometry, feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { garmentClass } from "@/lib/layout/config";
import { computeLayout, hash32, pickTemplate, type PieceIn, type SlotName } from "@/lib/layout/engine";
import FeedImage from "./FeedImage";

export const pieceClass = (slot: SlotName, c: FeedCard) => garmentClass(slot, c.name);

/** One outfit composed on a canvas: pieces at template positions, tap = product sheet (the like button lives in the sheet). */
export default function OutfitCanvas({ outfit, canvas, override, debug, cut = "auto", priority, onOpen }: {
  outfit: FeedOutfit; canvas: { w: number; h: number }; override?: string[]; debug?: boolean; cut?: CutMode; priority: boolean;
  onOpen: (c: FeedCard, slot: SlotName) => void;
}) {
  const cards = useMemo(() => {
    const v = (c: FeedCard) => viewCard(c, cut);
    return (outfit.kind === "full" ? { full: v(outfit.top), shoes: v(outfit.shoes) } : { top: v(outfit.top), bottom: outfit.bottom ? v(outfit.bottom) : undefined, shoes: v(outfit.shoes) }) as Partial<Record<SlotName, ReturnType<typeof v>>>;
  }, [outfit, cut]);
  const layout = useMemo(() => {
    const pieces: Partial<Record<SlotName, PieceIn>> = {};
    for (const [slot, c] of Object.entries(cards) as [SlotName, FeedCard][]) {
      const g = cropGeometry(c);
      pieces[slot] = { slot, cls: pieceClass(slot, c), aspect: g ? g.cw / g.ch : null, presentation: c.presentation ?? null, hem: c.hem ?? null, waist: c.waist ?? null, fill: c.fill ?? null };
    }
    const seed = hash32(String(outfit.id));
    // rule layout by default; ?layout=A,FB forces one of the old random templates (debug)
    return computeLayout({ kind: outfit.kind, pieces, seed, canvas, template: override?.length ? pickTemplate(outfit.kind, seed, override) : undefined });
  }, [cards, outfit, canvas, override]);

  const orig = (c: FeedCard): FeedCard => (c.id === outfit.top.id ? outfit.top : c.id === outfit.shoes.id ? outfit.shoes : outfit.bottom ?? c);
  const { w: W, h: H } = canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="relative" style={{ width: W, height: H }} data-layout={layout.template} data-cuts={layout.pieces.map((p) => (cards[p.slot]!.cut ? "1" : "0")).join("")}>
      {debug && <>
        <div className="absolute border border-dashed border-sky-400 bg-sky-50/60" style={{ left: pct(layout.marginRect.x, W), top: 0, width: pct(layout.marginRect.w, W), height: "100%" }} />
        <span className="absolute left-1 top-0 z-50 rounded bg-black px-1 text-[10px] text-white">{layout.template}{layout.debug ? ` ${layout.debug.binding.join("+")}` : ""}</span>
        {layout.debug && <>
          <div className="absolute z-40 border-l border-dashed border-blue-600" style={{ left: pct(layout.debug.axisX, W), top: 0, height: "100%" }} title="left axis" />
          <div className="absolute z-40 border-l border-dashed border-green-600" style={{ left: pct(layout.debug.centreX, W), top: 0, height: "100%" }} title="canvas centre axis" />
          {[layout.debug.hemLine, layout.debug.waistLine].map((l, i) => l && (
            <div key={i} className="absolute z-50 h-[3px] bg-red-600" style={{ left: pct(l.x0, W), width: pct(l.x1 - l.x0, W), top: pct(l.y - 1.5, H) }} />
          ))}
        </>}
      </>}
      {layout.pieces.map((p) => {
        const c = cards[p.slot]!;
        return (
          <div key={p.slot} className="absolute" style={{ left: pct(p.rect.x, W), top: pct(p.rect.y, H), width: pct(p.rect.w, W), height: pct(p.rect.h, H), zIndex: p.z, transform: p.rot ? `rotate(${p.rot}deg)` : undefined }}>
            <button type="button" onClick={() => onOpen(orig(c), p.slot)} aria-label={`${c.brand} ${c.name}`} className={`absolute inset-0 ${debug ? "outline outline-1 outline-red-400" : ""}`}>
              <FeedImage card={c} src={feedSrc(c, pieceClass(p.slot, c))} fill={1} priority={priority} blend={!c.cut} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
