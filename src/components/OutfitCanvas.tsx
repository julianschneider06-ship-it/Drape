"use client";
import { useEffect, useMemo } from "react";
import type { FeedAccessory, FeedCard, FeedOutfit } from "@/lib/types";
import { cropGeometry, feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { garmentClass } from "@/lib/layout/config";
import { computeLayout, hash32, pickTemplate, type AccIn, type AccSlot, type PieceIn, type SlotName } from "@/lib/layout/engine";
import FeedImage from "./FeedImage";

export const pieceClass = (slot: SlotName, c: FeedCard) => (slot.startsWith("acc") ? "top" : garmentClass(slot as "top" | "bottom" | "shoes" | "full", c.name));

/** One outfit composed on a canvas: pieces at template positions, tap = product sheet (the like button lives in the sheet). */
export default function OutfitCanvas({ outfit, canvas, override, debug, cut = "auto", showAcc = true, priority, onOpen, onLayout }: {
  outfit: FeedOutfit; canvas: { w: number; h: number }; override?: string[]; debug?: boolean; cut?: CutMode; showAcc?: boolean; priority: boolean;
  onOpen: (c: FeedCard, slot: SlotName) => void; onLayout?: (layout: string, mode: string) => void;
}) {
  const cards = useMemo(() => {
    const v = (c: FeedCard) => viewCard(c, cut);
    return (outfit.kind === "full" ? { full: v(outfit.top), shoes: v(outfit.shoes) } : { top: v(outfit.top), bottom: outfit.bottom ? v(outfit.bottom) : undefined, shoes: v(outfit.shoes) }) as Partial<Record<SlotName, ReturnType<typeof v>>>;
  }, [outfit, cut]);
  // accessories: up to three, each with its cutout card; slot names acc1..acc3 follow the cached order
  const accs = useMemo(() => {
    const out: { slot: AccSlot; acc: FeedAccessory; card: ReturnType<typeof viewCard> }[] = [];
    if (!showAcc) return out;
    (outfit.accessories ?? []).slice(0, 3).forEach((a, i) => { if (a.card && a.card.cutout) out.push({ slot: `acc${i + 1}` as AccSlot, acc: a, card: viewCard(a.card, cut) }); });
    return out;
  }, [outfit, cut, showAcc]);
  const layout = useMemo(() => {
    const pieces: Partial<Record<SlotName, PieceIn>> = {};
    for (const [slot, c] of Object.entries(cards) as [SlotName, FeedCard][]) {
      const g = cropGeometry(c);
      pieces[slot] = { slot, cls: pieceClass(slot, c), aspect: g ? g.cw / g.ch : null, presentation: c.presentation ?? null, hem: c.hem ?? null, waist: c.waist ?? null, collar: c.collar ?? null, hood: c.hood ?? null, fill: c.fill ?? null };
    }
    const seed = hash32(String(outfit.id));
    const accessories: AccIn[] = accs.map(({ slot, acc, card }) => { const g = cropGeometry(card); return { slot, type: acc.type, size: acc.size, aspect: g ? g.cw / g.ch : null, placement: acc.placement, zone: acc.zone ?? "mid", frontFlat: !!acc.front_flat, beltShape: acc.belt_shape }; });
    // rule layout by default; ?layout=A,FB forces one of the old random templates (debug)
    return computeLayout({ kind: outfit.kind, pieces, seed, canvas, accessories, template: override?.length ? pickTemplate(outfit.kind, seed, override) : undefined });
  }, [cards, outfit, canvas, override, accs]);

  useEffect(() => { onLayout?.(layout.template, layout.debug?.mode ?? "template"); }, [layout, onLayout]);

  const orig = (c: FeedCard, slot: SlotName): FeedCard => (slot.startsWith("acc") ? (accs.find((a) => a.slot === slot)?.acc.card ?? c) : c.id === outfit.top.id ? outfit.top : c.id === outfit.shoes.id ? outfit.shoes : outfit.bottom ?? c);
  const { w: W, h: H } = canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="relative" style={{ width: W, height: H }} data-layout={layout.template} data-cuts={layout.pieces.map((p) => ((cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card)?.cut ? "1" : "0")).join("")} data-stack={(() => { const b = layout.pieces.find((p) => p.slot === "bottom" || p.slot === "full"), t = layout.pieces.find((p) => p.slot === "top" || p.slot === "full"), sh = layout.pieces.find((p) => p.slot === "shoes"); return b && t && sh ? `${(t.rect.y / H).toFixed(3)}:${(b.rect.y / H).toFixed(3)}:${((sh.rect.y + sh.rect.h) / H).toFixed(3)}` : ""; })()} data-rects={layout.pieces.map((p) => `${p.slot}:${Math.round(p.rect.x)},${Math.round(p.rect.y)},${Math.round(p.rect.w)},${Math.round(p.rect.h)}`).join(";")} data-dem={layout.debug?.acc?.demoted.join("|") ?? ""} data-lim={layout.debug?.acc?.limited?.join(",") ?? ""} data-head={layout.debug?.acc ? `${layout.debug.acc.headZone ? 1 : 0}:${layout.debug.acc.headShrink.toFixed(3)}:${layout.debug.acc.dropped.length}:${layout.debug.acc.demoted.length}` : ""} data-acc={layout.debug?.acc ? layout.debug.acc.placed.map((a) => `${a.type}:${a.kind}`).join(",") : ""}>
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
        const c = (cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card)!;
        return (
          <div key={p.slot} className="absolute" style={{ left: pct(p.rect.x, W), top: pct(p.rect.y, H), width: pct(p.rect.w, W), height: pct(p.rect.h, H), zIndex: p.z, transform: p.rot ? `rotate(${p.rot}deg)` : undefined }}>
            <button type="button" onClick={() => onOpen(orig(c, p.slot), p.slot)} aria-label={`${c.brand} ${c.name}`} className={`absolute inset-0 ${debug ? "outline outline-1 outline-red-400" : ""}`}>
              <FeedImage card={c} src={feedSrc(c, pieceClass(p.slot, c))} fill={1} priority={priority} blend={!c.cut} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
