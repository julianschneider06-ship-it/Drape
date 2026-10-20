"use client";
import { useMemo } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import { cropGeometry, feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { garmentClass } from "@/lib/layout/config";
import { computeLayout, hash32, HEART_PX, pickTemplate, type PieceIn, type SlotName } from "@/lib/layout/engine";
import FeedImage from "./FeedImage";
import Heart from "./Heart";

export const pieceClass = (slot: SlotName, c: FeedCard) => garmentClass(slot, c.name);

/** One outfit composed on a canvas: pieces at template positions, tap = sheet, small heart at each piece's corner. */
export default function OutfitCanvas({ outfit, canvas, override, debug, cut = "auto", liked, priority, onOpen, onLike }: {
  outfit: FeedOutfit; canvas: { w: number; h: number }; override?: string[]; debug?: boolean; cut?: CutMode; priority: boolean;
  liked: (id: number) => boolean; onOpen: (c: FeedCard, slot: SlotName) => void; onLike: (c: FeedCard, slot: SlotName) => void;
}) {
  const cards = useMemo(() => {
    const v = (c: FeedCard) => viewCard(c, cut);
    return (outfit.kind === "full" ? { full: v(outfit.top), shoes: v(outfit.shoes) } : { top: v(outfit.top), bottom: outfit.bottom ? v(outfit.bottom) : undefined, shoes: v(outfit.shoes) }) as Partial<Record<SlotName, ReturnType<typeof v>>>;
  }, [outfit, cut]);
  const layout = useMemo(() => {
    const pieces: Partial<Record<SlotName, PieceIn>> = {};
    for (const [slot, c] of Object.entries(cards) as [SlotName, FeedCard][]) {
      const g = cropGeometry(c);
      pieces[slot] = { slot, cls: pieceClass(slot, c), aspect: g ? g.cw / g.ch : null };
    }
    const seed = hash32(String(outfit.id));
    return computeLayout({ kind: outfit.kind, pieces, seed, canvas, template: pickTemplate(outfit.kind, seed, override) });
  }, [cards, outfit, canvas, override]);

  const orig = (c: FeedCard): FeedCard => (c.id === outfit.top.id ? outfit.top : c.id === outfit.shoes.id ? outfit.shoes : outfit.bottom ?? c);
  const { w: W, h: H } = canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="relative" style={{ width: W, height: H }} data-layout={layout.template} data-cuts={layout.pieces.map((p) => (cards[p.slot]!.cut ? "1" : "0")).join("")}>
      {debug && <>
        <div className="absolute border border-dashed border-sky-400 bg-sky-50/60" style={{ left: pct(layout.marginRect.x, W), top: 0, width: pct(layout.marginRect.w, W), height: "100%" }} />
        <span className="absolute left-1 top-0 z-50 rounded bg-black px-1 text-[10px] text-white">{layout.template}</span>
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
      {layout.pieces.map((p) => {
        const c = cards[p.slot]!, on = liked(c.id);
        return (
          <div key={"h" + p.slot} className="absolute z-40 flex items-center justify-center" style={{ left: pct(p.heart.x - HEART_PX / 2, W), top: pct(p.heart.y - HEART_PX / 2, H), width: HEART_PX, height: HEART_PX }}>
            <Heart on={on} size={18} onClick={(e) => { e.stopPropagation(); onLike(orig(c), p.slot); }} label={on ? "Remove like" : "Like"} />
          </div>
        );
      })}
    </div>
  );
}
