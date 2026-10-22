"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SwapEvt } from "@/lib/client/swap";
import type { FeedAccessory, FeedCard, FeedOutfit } from "@/lib/types";
import { cropGeometry, feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { garmentClass, RULES, SALE_LABEL } from "@/lib/layout/config";
import { isOnSale, saleMarkerOn } from "@/lib/client/sale";
import { showSale } from "@/lib/search";
import { computeLayout, hash32, pickTemplate, type AccIn, type AccSlot, type PieceIn, type SlotName } from "@/lib/layout/engine";
import FeedImage from "./FeedImage";
import { tagLine } from "@/outfits/tags";

export const pieceClass = (slot: SlotName, c: FeedCard) => (slot.startsWith("acc") ? "top" : garmentClass(slot as "top" | "bottom" | "shoes" | "full", c.name));

/** One outfit composed on a canvas: pieces at template positions, tap = product sheet (the like button lives in the sheet). */
function OutfitCanvas({ outfit, canvas, override, debug, cut = "auto", showAcc = true, priority, onOpen, onLayout, onSwipe, swapEvt, animateLayout = true, dim }: {
  outfit: FeedOutfit; canvas: { w: number; h: number }; override?: string[]; debug?: boolean; cut?: CutMode; showAcc?: boolean; priority: boolean;
  onOpen: (c: FeedCard, slot: SlotName) => void; onLayout?: (layout: string, mode: string) => void;
  onSwipe?: (slot: SlotName, dir: "next" | "prev") => void; swapEvt?: SwapEvt; dim?: (slot: SlotName) => boolean; animateLayout?: boolean;   // dim: Search tab, pieces that are not the searched item are greyed out and cannot be tapped; animateLayout=false: a swapped piece snaps to its new box (no layout animation)
}) {
  const cards = useMemo(() => {
    const v = (c: FeedCard) => viewCard(c, cut);
    return (outfit.kind === "full" ? { full: v(outfit.top), shoes: v(outfit.shoes) } : { top: v(outfit.top), bottom: outfit.bottom ? v(outfit.bottom) : undefined, shoes: v(outfit.shoes) }) as Partial<Record<SlotName, ReturnType<typeof v>>>;
  }, [outfit, cut]);
  // accessories: up to eight (the composer limit is WOMEN_ACC.maxTotal), each with its cutout card; slot names acc1..acc8 follow the cached order
  const accs = useMemo(() => {
    const out: { slot: AccSlot; acc: FeedAccessory; card: ReturnType<typeof viewCard> }[] = [];
    if (!showAcc) return out;
    (outfit.accessories ?? []).slice(0, 8).forEach((a, i) => { if (a.card && a.card.cutout) out.push({ slot: `acc${a.slot_no ?? i + 1}` as AccSlot, acc: a, card: viewCard(a.card, cut) }); });
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

  // ---- swipe on a piece = swap that piece (horizontal, mostly-horizontal drags only; vertical scrolling is never touched) ----
  const gest = useRef<{ x: number; y: number; slot: string | null; mode: "idle" | "swipe" | "scroll" } | null>(null);
  const suppressUntil = useRef(0);
  const down = (e: React.PointerEvent) => {
    if (!onSwipe || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-slot]");   // topmost piece under the finger (shoes / overlays win)
    gest.current = { x: e.clientX, y: e.clientY, slot: el?.getAttribute("data-slot") ?? null, mode: "idle" };
  };
  const move = (e: React.PointerEvent) => {
    const g = gest.current; if (!g || g.mode === "scroll") return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.mode === "idle") {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 0.7) g.mode = "scroll";
      else if (g.slot && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 2) g.mode = "swipe";
    }
  };
  const up = (e: React.PointerEvent) => {
    const g = gest.current; gest.current = null;
    if (!g || g.mode !== "swipe") return;
    const dx = e.clientX - g.x;
    suppressUntil.current = Date.now() + 350;   // the tap that would follow a drag must not open the sheet
    if (Math.abs(dx) >= 44 && g.slot) onSwipe?.(g.slot as SlotName, dx > 0 ? "next" : "prev")   // swipe right = next, swipe left = previous (both loop);
  };
  // ghosts: the piece that was swapped out slides away while the new one slides in
  const prevPieces = useRef<Record<string, { card: ReturnType<typeof viewCard>; rect: { x: number; y: number; w: number; h: number } }>>({});
  const [ghosts, setGhosts] = useState<{ id: string; card: ReturnType<typeof viewCard>; rect: { x: number; y: number; w: number; h: number }; dir: "next" | "prev"; slot: string }[]>([]);
  useEffect(() => {
    if (!swapEvt) return;
    const old = prevPieces.current[swapEvt.slot];
    if (!old || old.card.id === swapEvt.newId) return;
    const gid = `${swapEvt.seq}`;
    setGhosts((g) => [...g, { id: gid, card: old.card, rect: old.rect, dir: swapEvt.dir, slot: swapEvt.slot }]);
    const t = setTimeout(() => setGhosts((g) => g.filter((x) => x.id !== gid)), 340);
    return () => clearTimeout(t);
  }, [swapEvt?.seq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m: typeof prevPieces.current = {};
    for (const p of layout.pieces) { const c = cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card; if (c) m[p.slot] = { card: c, rect: p.rect }; }
    prevPieces.current = m;
  });

  // "SALE" label per piece on sale: side with room (away from the other pieces first), never over a piece, the margin or outside the canvas
  const labels = useMemo(() => {
    const out: Record<string, { side: "left" | "right"; dy: number }> = {};
    if (!saleMarkerOn()) return out;
    const { w: W, h: H } = canvas;
    const fs = SALE_LABEL.fontShare * W, lw = fs * SALE_LABEL.lineEm, lh = fs * SALE_LABEL.lenEm, gap = SALE_LABEL.gap * W, pad = RULES.edgePad * W;
    for (const p of layout.pieces) {
      const c = cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card;
      if (!c || !c.cut || !showSale(isOnSale(c), !!dim?.(p.slot))) continue;   // Search: only the searched piece gets a label
      const others = layout.pieces.filter((q) => q.slot !== p.slot);
      const meanX = others.length ? others.reduce((a, q) => a + q.rect.x + q.rect.w / 2, 0) / others.length : W / 2;
      const order: ("left" | "right")[] = p.rect.x + p.rect.w / 2 < meanX ? ["left", "right"] : ["right", "left"];
      const cy = p.rect.y + p.rect.h / 2, y = Math.min(H - pad - lh, Math.max(pad, cy - lh / 2));
      // tiers: normal margin first; if neither side has room (wide or stacked pieces), slide the label along the piece and then allow it closer to the canvas edge
      // (never over another piece). A sale product always gets its label unless there is truly no free spot.
      const ys = [y, ...[0.2, 0.4, 0.6, 0.8].flatMap((f) => [p.rect.y + f * p.rect.h - lh / 2, p.rect.y + p.rect.h * (1 - f) - lh / 2])].map((v) => Math.min(H - 2 - lh, Math.max(2, v)));
      let placed = false;
      const mainSlots = new Set(["top", "bottom", "shoes", "full"]);
      for (const [edge, blockers] of [[pad, others], [2, others], [2, others.filter((q) => mainSlots.has(q.slot))]] as const) {   // last tier: may touch other accessories, never a main piece
        for (const yy of ys) for (const side of order) {
          const x = side === "right" ? p.rect.x + p.rect.w + gap : p.rect.x - gap - lw;
          const r = { x, y: yy, w: lw, h: lh };
          if (x < edge || x + lw > W - edge) continue;
          if (blockers.some((q) => r.x < q.rect.x + q.rect.w + 2 && r.x + r.w + 2 > q.rect.x && r.y < q.rect.y + q.rect.h + 2 && r.y + r.h + 2 > q.rect.y)) continue;
          out[p.slot] = { side, dy: yy - p.rect.y }; placed = true; break;
        }
        if (placed) break;
      }
    }
    return out;
  }, [layout, cards, accs, canvas, dim]);

  const orig = (c: FeedCard, slot: SlotName): FeedCard => (slot.startsWith("acc") ? (accs.find((a) => a.slot === slot)?.acc.card ?? c) : c.id === outfit.top.id ? outfit.top : c.id === outfit.shoes.id ? outfit.shoes : outfit.bottom ?? c);
  const { w: W, h: H } = canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div className="relative" style={{ width: W, height: H, touchAction: "pan-y" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gest.current = null; }} data-layout={layout.template} data-cuts={layout.pieces.map((p) => ((cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card)?.cut ? "1" : "0")).join("")} data-stack={(() => { const b = layout.pieces.find((p) => p.slot === "bottom" || p.slot === "full"), t = layout.pieces.find((p) => p.slot === "top" || p.slot === "full"), sh = layout.pieces.find((p) => p.slot === "shoes"); return b && t && sh ? `${(t.rect.y / H).toFixed(3)}:${(b.rect.y / H).toFixed(3)}:${((sh.rect.y + sh.rect.h) / H).toFixed(3)}` : ""; })()} data-rects={layout.pieces.map((p) => `${p.slot}${layout.debug?.acc?.placed.find((q) => q.slot === p.slot)?.type ? "=" + layout.debug.acc.placed.find((q) => q.slot === p.slot)!.type + "/" + layout.debug.acc.placed.find((q) => q.slot === p.slot)!.kind : ""}:${Math.round(p.rect.x)},${Math.round(p.rect.y)},${Math.round(p.rect.w)},${Math.round(p.rect.h)}`).join(";")} data-dem={layout.debug?.acc?.demoted.join("|") ?? ""} data-lim={layout.debug?.acc?.limited?.join(",") ?? ""} data-head={layout.debug?.acc ? `${layout.debug.acc.headZone ? 1 : 0}:${layout.debug.acc.headShrink.toFixed(3)}:${layout.debug.acc.dropped.length}:${layout.debug.acc.demoted.length}` : ""} data-acc={layout.debug?.acc ? layout.debug.acc.placed.map((a) => `${a.type}:${a.kind}`).join(",") : ""}>
      {debug && <>
        <div className="absolute border border-dashed border-sky-400 bg-sky-50/60" style={{ left: pct(layout.marginRect.x, W), top: 0, width: pct(layout.marginRect.w, W), height: "100%" }} />
        <span className="absolute left-1 top-0 z-50 rounded bg-black px-1 text-[10px] text-white">{layout.template}{layout.debug ? ` ${layout.debug.binding.join("+")}` : ""}</span>
        {outfit.tags && <span className="absolute bottom-0 left-1 right-1 z-50 rounded bg-black/80 px-1 py-0.5 text-[9px] leading-tight text-white" data-tags>{tagLine(outfit.tags)}</span>}
        {layout.debug && <>
          <div className="absolute z-40 border-l border-dashed border-blue-600" style={{ left: pct(layout.debug.axisX, W), top: 0, height: "100%" }} title="left axis" />
          <div className="absolute z-40 border-l border-dashed border-green-600" style={{ left: pct(layout.debug.centreX, W), top: 0, height: "100%" }} title="canvas centre axis" />
          {[layout.debug.hemLine, layout.debug.waistLine].map((l, i) => l && (
            <div key={i} className="absolute z-50 h-[3px] bg-red-600" style={{ left: pct(l.x0, W), width: pct(l.x1 - l.x0, W), top: pct(l.y - 1.5, H) }} />
          ))}
        </>}
      </>}
      {ghosts.map((gh) => (
        <div key={`ghost-${gh.id}`} className={`pointer-events-none absolute ${gh.dir === "next" ? "swap-out-next" : "swap-out-prev"}`} style={{ left: pct(gh.rect.x, W), top: pct(gh.rect.y, H), width: pct(gh.rect.w, W), height: pct(gh.rect.h, H), zIndex: 60 }}>
          <FeedImage card={gh.card} src={feedSrc(gh.card, pieceClass(gh.slot as SlotName, gh.card))} fill={1} priority blend={!gh.card.cut} wShare={gh.rect.w / W} />
        </div>
      ))}
      {layout.pieces.map((p) => {
        const c = (cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card)!;
        const isNew = swapEvt?.kind === "swap" && swapEvt.slot === p.slot && swapEvt.newId === c.id;
        const bounce = "", dimmed = !!dim?.(p.slot);
        return (
          <div key={p.slot} data-slot={p.slot} className={`absolute ${bounce}`} style={{ left: pct(p.rect.x, W), top: pct(p.rect.y, H), width: pct(p.rect.w, W), height: pct(p.rect.h, H), zIndex: p.z, transform: p.rot ? `rotate(${p.rot}deg)` : undefined, transition: animateLayout ? "left .32s ease, top .32s ease, width .32s ease, height .32s ease" : "none", touchAction: "pan-y", ...(dimmed ? { opacity: 0.4, filter: "saturate(0.35)", pointerEvents: "none" as const } : {}) }} {...(dimmed ? { "data-dim": "1" } : {})}>
            <button key={`${p.slot}-${c.id}-${isNew ? swapEvt!.seq : 0}`} type="button" onClickCapture={(e) => { if (Date.now() < suppressUntil.current) { e.stopPropagation(); e.preventDefault(); } }} onClick={() => onOpen(orig(c, p.slot), p.slot)} disabled={dimmed} tabIndex={dimmed ? -1 : undefined} aria-label={`${c.brand} ${c.name}`}
              className={`absolute inset-0 ${isNew ? (swapEvt!.dir === "next" ? "swap-in-next" : "swap-in-prev") : ""} ${debug ? "outline outline-1 outline-red-400" : ""}`} style={{ touchAction: "pan-y" }}>
              <FeedImage card={c} src={feedSrc(c, pieceClass(p.slot, c))} fill={1} priority={priority} blend={!c.cut} wShare={p.rect.w / W} noSale={dimmed} />
              {labels[p.slot] && (
                <span aria-hidden className="pointer-events-none absolute select-none whitespace-nowrap" data-sale-label={labels[p.slot].side}
                  style={{ [labels[p.slot].side === "right" ? "left" : "right"]: "100%", [labels[p.slot].side === "right" ? "marginLeft" : "marginRight"]: SALE_LABEL.gap * W, top: labels[p.slot].dy,
                    fontFamily: "var(--font-marker), 'Permanent Marker', cursive", fontSize: SALE_LABEL.fontShare * W, lineHeight: SALE_LABEL.lineEm, color: "#e0221b",
                    writingMode: "vertical-rl", transform: "rotate(180deg) rotate(1.5deg)", letterSpacing: "0.02em" }}>SALE</span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// memo: a gesture in one outfit must not re-render the others (the tutorial passes stable props)
export default memo(OutfitCanvas);
