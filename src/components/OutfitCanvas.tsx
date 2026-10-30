"use client";
import { STRIPE_BG } from "@/config/stripe-bg";
import { productImprintCss, productShadowCss } from "@/lib/stripe-bg";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SwapEvt } from "@/lib/client/swap";
import type { FeedAccessory, FeedCard, FeedOutfit } from "@/lib/types";
import { cropGeometry, feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { garmentClass, RULES, SALE_LABEL } from "@/lib/layout/config";
import { isOnSale, useSaleMarker } from "@/lib/client/sale";
import { showSale } from "@/lib/search";
import { greyGesture } from "@/lib/wishlist-outfits";
import { shineColor, shineStrokes, wobblyBox } from "@/lib/shine";
import { PRICE_TAG, SHINE } from "@/config/search";
import { placePriceTag, priceTagSize, priceTagText } from "@/lib/price-tag";
import { computeLayout, hash32, pickTemplate, type AccIn, type AccSlot, type PieceIn, type SlotName } from "@/lib/layout/engine";
import { hitCategory, HIT_DEBUG_COLORS, HIT_ICON_ZONE } from "@/config/hit-area";
import { hitInsets } from "@/lib/hit-areas";
import { ProductGesture, doubleTapWindow, parseTapDelay } from "@/lib/product-gesture";
import { TAP_OPEN_DELAY_MS } from "@/config/product-gesture";
import { decideAxis, swapOnRelease } from "@/lib/gestures";
import LikePop, { type LikePopHandle } from "./LikePop";
import FeedImage from "./FeedImage";
import { tagLine } from "@/outfits/tags";
import { isBlankId } from "@/lib/my-outfits";
import { applyAccLayout, type AccLayout } from "@/lib/my-outfits-acc";

export const pieceClass = (slot: SlotName, c: FeedCard) => (slot.startsWith("acc") ? "top" : garmentClass(slot as "top" | "bottom" | "shoes" | "full", c.name));

/** One outfit composed on a canvas: pieces at template positions, tap = product sheet (the like button lives in the sheet). */
function OutfitCanvas({ outfit, canvas, override, debug, cut = "auto", showAcc = true, priority, onOpen, onLayout, onSwipe, swapEvt, animateLayout = true, dim, likeDim, shine, reserveIcons, priceTag, onLike, accLayout, greyAccent }: {
  /** Simple stripe mode: soft grey contact shadow under every product + a faint grey imprint behind it (static CSS, no size/position/tap-area change) */
  greyAccent?: boolean;
  outfit: FeedOutfit; canvas: { w: number; h: number }; accLayout?: (AccLayout | null)[]; override?: string[];   // accLayout: My Outfits only, custom vertical position / size per accessory slot (acc1 = index 0)
  debug?: boolean; cut?: CutMode; showAcc?: boolean; priority: boolean;
  onOpen: (c: FeedCard, slot: SlotName) => void; onLayout?: (layout: string, mode: string, slots: string[]) => void;
  onSwipe?: (slot: SlotName, dir: "next" | "prev") => void; swapEvt?: SwapEvt; dim?: (slot: SlotName) => boolean; likeDim?: boolean; shine?: { color: string | null }; animateLayout?: boolean; reserveIcons?: boolean; priceTag?: boolean; onLike?: (c: FeedCard, slot: SlotName) => boolean | void;   // likeDim (Generate Outfits only): greyed pieces still take a double tap = like (single tap does nothing);   // onLike given = product gestures: single tap opens (after the double-tap window), double tap toggles the like (returns the new state); without it the old single tap opens (welcome tutorial);   // priceTag: Search only, hand-drawn price box next to the searched (not dimmed) piece, decoration (not tappable);   // reserveIcons: the attribute icons sit top left (non-tappable), tap areas never extend into them;   // shine: Search only, decorative strokes around the searched (not dimmed) piece; dim: Search tab, pieces that are not the searched item are greyed out and cannot be tapped; animateLayout=false: a swapped piece snaps to its new box (no layout animation)
}) {
  const saleOn = useSaleMarker();   // app setting AND the Profile choice (re-renders when the user flips it)
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
  // Search price tag: the searched piece = the first slot that is not greyed out; no price = no tag
  const tagInfo = useMemo(() => {
    if (!priceTag || !dim) return null;
    const slots = [...(Object.keys(cards) as SlotName[]), ...accs.map((a) => a.slot)];
    const slot = slots.find((sl) => !dim(sl));
    const c = slot ? (cards[slot] ?? accs.find((a) => a.slot === slot)?.card) : undefined;
    const text = c ? priceTagText(c) : null;
    return slot && c && text ? { slot, id: c.id, text, ...priceTagSize(text) } : null;
  }, [priceTag, dim, cards, accs]);
  const layout = useMemo(() => {
    const pieces: Partial<Record<SlotName, PieceIn>> = {};
    for (const [slot, c] of Object.entries(cards) as [SlotName, FeedCard][]) {
      const g = cropGeometry(c);
      pieces[slot] = { slot, cls: pieceClass(slot, c), aspect: g ? g.cw / g.ch : null, presentation: c.presentation ?? null, hem: c.hem ?? null, waist: c.waist ?? null, collar: c.collar ?? null, hood: c.hood ?? null, fill: c.fill ?? null };
    }
    const seed = hash32(String(outfit.id));
    const accessories: AccIn[] = accs.map(({ slot, acc, card }) => { const g = cropGeometry(card); return { slot, type: acc.type, size: acc.size, aspect: g ? g.cw / g.ch : null, placement: acc.placement, zone: acc.zone ?? "mid", frontFlat: !!acc.front_flat, beltShape: acc.belt_shape }; });
    // rule layout by default; ?layout=A,FB forces one of the old random templates (debug)
    const base = computeLayout({ kind: outfit.kind, pieces, seed, canvas, accessories, template: override?.length ? pickTemplate(outfit.kind, seed, override) : undefined, priceTag: tagInfo ? { slot: tagInfo.slot, w: tagInfo.w, h: tagInfo.h } : undefined });
    return accLayout?.some(Boolean) ? { ...base, pieces: applyAccLayout(base.pieces, accLayout, canvas.w, canvas.h) } : base;
  }, [cards, outfit, canvas, override, accs, tagInfo, accLayout]);

  // invisible tap areas: visible rect + HIT_PADDING per category, split at the midpoint between neighbours, clamped to the card (src/lib/hit-areas.ts)
  const hits = useMemo(() => hitInsets(layout.pieces.map((p) => ({ slot: p.slot, rect: p.rect, cat: hitCategory(p.slot, accs.find((a) => a.slot === p.slot)?.acc.type) })), canvas, reserveIcons ? [HIT_ICON_ZONE] : []), [layout, accs, canvas, reserveIcons]);
  const [hitDbg, setHitDbg] = useState(false);   // ?hit=1: draw every tap area (link parameter only, no effect on behaviour)
  useEffect(() => { try { setHitDbg(new URLSearchParams(location.search).get("hit") === "1"); } catch { /* ignore */ } }, []);

  useEffect(() => { onLayout?.(layout.template, layout.debug?.mode ?? "template", layout.pieces.map((p) => p.slot)); }, [layout, onLayout]);

  // ---- swipe on a piece = swap that piece. Axis lock after AXIS_LOCK_PX (src/lib/gestures.ts): horizontal-ish on a piece owns the gesture
  // (native touchmove is cancelled so the vertical scroller cannot take over), clearly vertical = outfit scroll, no swap. ----
  const root = useRef<HTMLDivElement>(null);
  const gest = useRef<{ x: number; y: number; t: number; slot: string | null; mode: "idle" | "swipe" | "scroll" } | null>(null);
  const suppressUntil = useRef(0);
  const down = (e: React.PointerEvent) => {
    if (!onSwipe || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-slot]");   // topmost piece under the finger (shoes / overlays win)
    gest.current = { x: e.clientX, y: e.clientY, t: Date.now(), slot: el?.getAttribute("data-slot") ?? null, mode: "idle" };
  };
  const move = (e: React.PointerEvent) => {
    const g = gest.current; if (!g || g.mode !== "idle") return;
    const axis = decideAxis(e.clientX - g.x, e.clientY - g.y);
    if (axis === "y") g.mode = "scroll"; else if (axis === "x" && g.slot) g.mode = "swipe";
  };
  const up = (e: React.PointerEvent) => {
    const g = gest.current; gest.current = null;
    if (!g || g.mode === "scroll") return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (g.mode === "idle" && !(g.slot && decideAxis(dx, dy) === "x")) return;   // a quick flick can end before the lock fired
    suppressUntil.current = Date.now() + 350;   // the tap that would follow a drag must not open the sheet
    if (g.slot && swapOnRelease(dx, Date.now() - g.t)) onSwipe?.(g.slot as SlotName, dx > 0 ? "next" : "prev");   // swipe right = next, swipe left = previous (both loop)
  };
  useEffect(() => {   // React's touchmove is passive: a native non-passive listener is needed to keep the scroller out of a locked swipe
    const el = root.current; if (!el || !onSwipe) return;
    const stop = (e: TouchEvent) => { if (gest.current?.mode === "swipe" && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, [onSwipe]);
  // ---- product gestures (only with onLike): single tap = open (after the double-tap window), double tap = like ----
  const pg = useRef(new ProductGesture());
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);   // pending single tap
  const pendingOpen = useRef<(() => void) | null>(null);   // the open the timer would run
  const openDelay = useRef(TAP_OPEN_DELAY_MS);
  useEffect(() => {   // ?tap=<ms>: debug override of the open delay (link parameter only)
    try { const d = parseTapDelay(location.search); if (d != null) { openDelay.current = d; pg.current = new ProductGesture(doubleTapWindow(d)); } } catch { /* ignore */ }
  }, []);
  const pops = useRef<Record<string, LikePopHandle | null>>({});   // double-tap like animation per piece: played imperatively, no state
  const clearLp = () => { if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; } pendingOpen.current = null; };
  useEffect(() => () => clearLp(), []);
  const gDown = (c: FeedCard, slot: SlotName) => (e: React.PointerEvent) => {
    if (!onLike || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }   // a second press started inside the open delay: hold the open until we know if it is a double tap
    pg.current.down(`${slot}:${c.id}`, Date.now(), e.clientX, e.clientY);
  };
  const gMove = (e: React.PointerEvent) => { if (onLike) pg.current.move(e.clientX, e.clientY); };
  const gUp = (c: FeedCard, slot: SlotName) => () => {
    if (!onLike) return;
    const a = pg.current.up(Date.now());
    const held = pendingOpen.current;   // first tap whose open was held by the second press
    clearLp();
    if (a === "like") { const now = onLike(orig(c, slot), slot); pops.current[slot]?.play(now !== false); }   // double tap: like, never open
    else if (greyGesture(a, !!(likeDim && dim?.(slot))) === "open") {
      const open = () => { lpTimer.current = null; pendingOpen.current = null; onOpen(orig(c, slot), slot); };
      pendingOpen.current = open; lpTimer.current = setTimeout(open, openDelay.current);
    } else held?.();   // the second press turned into a scroll: the first tap still counts
  };
  const gCancel = () => { if (!onLike) return; pg.current.cancel(); pendingOpen.current?.(); };

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
    if (!saleOn) return out;
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
  }, [layout, cards, accs, canvas, dim, saleOn]);

  // price tag spot: below the searched piece's lower-left corner, nudged to a free spot inside the card if needed (never over another piece or the SALE label)
  const tag = useMemo(() => {
    if (!tagInfo) return null;
    const me = layout.pieces.find((p) => p.slot === tagInfo.slot);
    if (!me) return null;
    const obstacles = layout.pieces.filter((p) => p.slot !== tagInfo.slot).map((p) => p.rect);
    const lb = labels[tagInfo.slot];
    if (lb) {
      const fs = SALE_LABEL.fontShare * canvas.w, lw = fs * SALE_LABEL.lineEm, lh = fs * SALE_LABEL.lenEm, gap = SALE_LABEL.gap * canvas.w;
      obstacles.push({ x: lb.side === "right" ? me.rect.x + me.rect.w + gap : me.rect.x - gap - lw, y: me.rect.y + lb.dy, w: lw, h: lh });
    }
    const pl = placePriceTag(tagInfo.text, me.rect, obstacles, canvas);
    return pl ? { ...pl, text: tagInfo.text, seed: hash32(`${outfit.id}:${tagInfo.id}:price`) } : null;
  }, [tagInfo, layout, labels, canvas, outfit.id]);

  const orig = (c: FeedCard, slot: SlotName): FeedCard => (slot.startsWith("acc") ? (accs.find((a) => a.slot === slot)?.acc.card ?? c) : c.id === outfit.top.id ? outfit.top : c.id === outfit.shoes.id ? outfit.shoes : outfit.bottom ?? c);
  const { w: W, h: H } = canvas;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div ref={root} className="relative" style={{ width: W, height: H, touchAction: "pan-y" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { gest.current = null; }} data-layout={layout.template} data-cuts={layout.pieces.map((p) => ((cards[p.slot] ?? accs.find((a) => a.slot === p.slot)?.card)?.cut ? "1" : "0")).join("")} data-stack={(() => { const b = layout.pieces.find((p) => p.slot === "bottom" || p.slot === "full"), t = layout.pieces.find((p) => p.slot === "top" || p.slot === "full"), sh = layout.pieces.find((p) => p.slot === "shoes"); return b && t && sh ? `${(t.rect.y / H).toFixed(3)}:${(b.rect.y / H).toFixed(3)}:${((sh.rect.y + sh.rect.h) / H).toFixed(3)}` : ""; })()} data-rects={layout.pieces.map((p) => `${p.slot}${layout.debug?.acc?.placed.find((q) => q.slot === p.slot)?.type ? "=" + layout.debug.acc.placed.find((q) => q.slot === p.slot)!.type + "/" + layout.debug.acc.placed.find((q) => q.slot === p.slot)!.kind : ""}:${Math.round(p.rect.x)},${Math.round(p.rect.y)},${Math.round(p.rect.w)},${Math.round(p.rect.h)}`).join(";")} data-dem={layout.debug?.acc?.demoted.join("|") ?? ""} data-lim={layout.debug?.acc?.limited?.join(",") ?? ""} data-head={layout.debug?.acc ? `${layout.debug.acc.headZone ? 1 : 0}:${layout.debug.acc.headShrink.toFixed(3)}:${layout.debug.acc.dropped.length}:${layout.debug.acc.demoted.length}` : ""} data-acc={layout.debug?.acc ? layout.debug.acc.placed.map((a) => `${a.type}:${a.kind}`).join(",") : ""}>
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
        if (isBlankId(c.id)) return null;   // My Outfits: an empty main slot keeps its place in the layout but paints nothing
        const isNew = swapEvt?.kind === "swap" && swapEvt.slot === p.slot && swapEvt.newId === c.id;
        const bounce = "", dimmed = !!dim?.(p.slot);
        return (
          <div key={p.slot} data-slot={p.slot} className={`absolute ${bounce}`} style={{ left: pct(p.rect.x, W), top: pct(p.rect.y, H), width: pct(p.rect.w, W), height: pct(p.rect.h, H), zIndex: p.z, transform: p.rot ? `rotate(${p.rot}deg)` : undefined, transition: animateLayout ? "left .32s ease, top .32s ease, width .32s ease, height .32s ease" : "none", touchAction: "pan-y", ...(dimmed ? { opacity: 0.4, filter: "saturate(0.35)", ...(likeDim ? {} : { pointerEvents: "none" as const }) } : {}) }} {...(dimmed ? { "data-dim": "1" } : {})}>
            {greyAccent && !dimmed && <span aria-hidden className="pointer-events-none absolute" data-imprint={p.slot} style={{ left: `${-(STRIPE_BG.simple.imprint.scale - 1) * 50}%`, top: `${-(STRIPE_BG.simple.imprint.scale - 1) * 50}%`, width: `${STRIPE_BG.simple.imprint.scale * 100}%`, height: `${STRIPE_BG.simple.imprint.scale * 100}%`, background: productImprintCss() }} />}
            <button key={`${p.slot}-${c.id}-${isNew ? swapEvt!.seq : 0}`} type="button" onClickCapture={(e) => { if (Date.now() < suppressUntil.current) { e.stopPropagation(); e.preventDefault(); } }} onClick={(e) => { if (!onLike) onOpen(orig(c, p.slot), p.slot); else if (e.detail === 0 && !dimmed) onOpen(orig(c, p.slot), p.slot); }}
              {...(onLike ? { onPointerDown: gDown(c, p.slot), onPointerMove: gMove, onPointerUp: gUp(c, p.slot), onPointerCancel: gCancel, onContextMenu: (e: React.MouseEvent) => e.preventDefault() } : {})} disabled={dimmed && !likeDim} tabIndex={dimmed ? -1 : undefined} aria-label={`${c.brand} ${c.name}`}
              className={`absolute inset-0 select-none ${isNew ? (swapEvt!.dir === "next" ? "swap-in-next" : "swap-in-prev") : ""} ${debug ? "outline outline-1 outline-red-400" : ""}`} style={{ touchAction: "pan-y", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}>
              {greyAccent && !dimmed
                ? <span className="absolute inset-0" data-shadow={p.slot} style={{ filter: productShadowCss() }}><FeedImage card={c} src={feedSrc(c, pieceClass(p.slot, c))} fill={1} priority={priority} blend={!c.cut} wShare={p.rect.w / W} noSale={dimmed} /></span>
                : <FeedImage card={c} src={feedSrc(c, pieceClass(p.slot, c))} fill={1} priority={priority} blend={!c.cut} wShare={p.rect.w / W} noSale={dimmed} />}
              {!dimmed && hits[p.slot] && (hits[p.slot].l || hits[p.slot].t || hits[p.slot].r || hits[p.slot].b) ? <span aria-hidden data-hit="1" className="absolute" style={{ left: -hits[p.slot].l, top: -hits[p.slot].t, right: -hits[p.slot].r, bottom: -hits[p.slot].b }} /> : null}
              {onLike && (!dimmed || likeDim) && <LikePop ref={(h) => { pops.current[p.slot] = h; }} />}
              {shine && !dimmed && c.cut && (() => {
                const sale = saleOn && isOnSale(c), m = SHINE.distance + (sale ? SHINE.saleExtra : 0) + SHINE.length * 1.5 + SHINE.width + 2, w = p.rect.w, h = p.rect.h;
                return (
                  <svg aria-hidden className="pointer-events-none absolute overflow-visible" data-shine={c.id} style={{ left: -m, top: -m, width: w + 2 * m, height: h + 2 * m }} viewBox={`${-m} ${-m} ${w + 2 * m} ${h + 2 * m}`}
                    fill="none" stroke={shineColor(shine.color, sale)} strokeWidth={SHINE.width} strokeLinecap="round">
                    {shineStrokes(w, h, hash32(`${outfit.id}:${c.id}`), sale).map((d, i) => <path key={i} d={d} />)}
                  </svg>
                );
              })()}
              {labels[p.slot] && (
                <span aria-hidden className="pointer-events-none absolute select-none whitespace-nowrap" data-sale-label={labels[p.slot].side}
                  style={{ [labels[p.slot].side === "right" ? "left" : "right"]: "100%", [labels[p.slot].side === "right" ? "marginLeft" : "marginRight"]: SALE_LABEL.gap * W, top: labels[p.slot].dy,
                    fontFamily: "var(--font-marker), 'Permanent Marker', cursive", fontSize: SALE_LABEL.fontShare * W, lineHeight: SALE_LABEL.lineEm, color: "#e0221b",
                    writingMode: "vertical-rl", transform: "rotate(180deg) rotate(1.5deg)", letterSpacing: "0.02em" }}>SALE</span>
              )}
            </button>
            {hitDbg && !dimmed && hits[p.slot] && (() => {
              const h = hits[p.slot], col = HIT_DEBUG_COLORS[hitCategory(p.slot, accs.find((a) => a.slot === p.slot)?.acc.type)];
              return <span aria-hidden className="pointer-events-none absolute" data-hit-debug={p.slot} style={{ left: -h.l, top: -h.t, right: -h.r, bottom: -h.b, background: `rgba(${col},0.28)`, outline: `1px solid rgba(${col},0.9)` }} />;
            })()}
          </div>
        );
      })}
      {tag && (
        <div aria-hidden data-price-tag={tag.spot} className="pointer-events-none absolute select-none" style={{ left: pct(tag.rect.x, W), top: pct(tag.rect.y, H), width: tag.rect.w, height: tag.rect.h, zIndex: 70 }}>
          <svg className="absolute overflow-visible" style={{ left: 0, top: 0, width: tag.rect.w, height: tag.rect.h }} viewBox={`0 0 ${tag.rect.w} ${tag.rect.h}`} fill={PRICE_TAG.fill} stroke="none">
            <rect x="0" y="0" width={tag.rect.w} height={tag.rect.h} rx="2" />
            <g fill="none" stroke={PRICE_TAG.stroke} strokeWidth={PRICE_TAG.strokeWidth} strokeLinecap="round">
              {wobblyBox(tag.rect.w, tag.rect.h, tag.seed, { wobble: PRICE_TAG.wobble * tag.scale, overshoot: PRICE_TAG.overshoot * tag.scale }).map((d, i) => <path key={i} d={d} />)}
            </g>
          </svg>
          <span className="absolute inset-0 flex items-center justify-center whitespace-nowrap font-medium leading-none" style={{ fontSize: PRICE_TAG.fontPx * tag.scale, color: PRICE_TAG.text }}>{tag.text}</span>
        </div>
      )}
    </div>
  );
}

// memo: a gesture in one outfit must not re-render the others (the tutorial passes stable props)
export default memo(OutfitCanvas);
