"use client";
import { useEffect, useMemo, useRef } from "react";
import * as m from "motion/react-m";
import { animate, useIsPresent } from "motion/react";
import { DURATION_MS, SPRING, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { sheetMotion } from "@/lib/menu-motion";
import type { FeedCard } from "@/lib/types";
import { formatPrice } from "@/lib/client/format";
import { feedSrc, viewCard } from "@/lib/client/format";
import { outHref } from "@/lib/client/out-url";
import FeedImage from "./FeedImage";
import Heart from "./Heart";
import LikePop, { type LikePopHandle } from "./LikePop";
import { ProductGesture } from "@/lib/product-gesture";
import { blockTouchMove, sheetDrag } from "@/lib/gestures";

export default function ProductSheet({ card, liked, onLike, onClose, onViewProduct, feedVariant }: {
  card: FeedCard; liked: boolean; onLike: () => void; onClose: () => void; onViewProduct: () => void; feedVariant?: "base" | "dynamic" | "hybrid";
}) {
  const reduced = useReducedMotion(), present = useIsPresent();
  const mo = useMemo(() => sheetMotion(reduced), [reduced]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // double tap on the product image = same like toggle as the heart button (single tap does nothing here, so there is no delay); movement cancels, so scrolling stays free
  const pg = useRef(new ProductGesture()), pop = useRef<LikePopHandle | null>(null);
  const imgGesture = {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === "mouse" && e.button !== 0) return; pg.current.down("sheet", Date.now(), e.clientX, e.clientY); },
    onPointerMove: (e: React.PointerEvent) => { pg.current.move(e.clientX, e.clientY); },
    onPointerUp: () => { if (pg.current.up(Date.now()) === "like") { pop.current?.play(!liked); onLike(); } },
    onPointerCancel: () => pg.current.cancel(),
  };
  // Drag down: the sheet follows the finger 1:1 (transform on `wrap`, imperative); release below SHEET_SNAP_CLOSE_RATIO springs back, passing it (or a flick)
  // COMMITS the close at once (exit animation, finger may stay down, further movement ignored). Only when the content is at the top or the press began on the handle / image.
  // Native touch listeners: a non-passive touchmove keeps the browser from panning / refreshing the page and the feed behind never sees the gesture.
  const root = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null), panelEl = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const el = root.current; if (!el) return;
    const html = document.documentElement, body = document.body;
    const prev = [html.style.overscrollBehavior, body.style.overscrollBehavior];
    html.style.overscrollBehavior = body.style.overscrollBehavior = "none";   // no pull-to-refresh / chaining to the page while the sheet is open
    const setY = (y: number) => { if (wrap.current) wrap.current.style.transform = y ? `translate3d(0,${y}px,0)` : ""; };
    let d: { x: number; y: number; t: number; top: number; zone: boolean; last: number; offset: number; committed: boolean } | null = null;
    let run: { stop: () => void } | null = null;
    const cancelable = (e: Event) => { if (e.cancelable) e.preventDefault(); };
    const start = (e: TouchEvent) => {
      e.stopPropagation();
      if (d?.committed || e.touches.length !== 1) return;
      const t = e.touches[0]; run?.stop(); run = null;
      d = { x: t.clientX, y: t.clientY, t: Date.now(), top: panelEl.current?.scrollTop ?? 0, zone: !!(e.target as HTMLElement).closest("[data-sheet-grab]"), last: t.clientY, offset: 0, committed: false };
    };
    const move = (e: TouchEvent) => {
      e.stopPropagation();
      const t = e.touches[0], panel = panelEl.current; if (!t || !panel) return;
      if (d?.committed) { cancelable(e); return; }
      const step = d ? t.clientY - d.last : 0; if (d) d.last = t.clientY;
      if (d) {
        const r = sheetDrag(t.clientX - d.x, t.clientY - d.y, Date.now() - d.t, d.top, d.zone, panel.offsetHeight);
        if (r.action !== "ignore") {
          cancelable(e); d.offset = r.offset; setY(r.offset);
          if (r.action === "commit") {
            d.committed = true; pg.current.cancel();
            run = reduced ? null : animate(r.offset, panel.offsetHeight, { duration: sec(DURATION_MS.sheetOut), ease: "easeIn", onUpdate: setY });
            closeRef.current();
          }
          return;
        }
        if (d.offset) { d.offset = 0; setY(0); }
      }
      if (blockTouchMove(panel.contains(e.target as Node), panel.scrollHeight > panel.clientHeight + 1, panel.scrollTop, panel.scrollHeight - panel.clientHeight, step)) cancelable(e);
    };
    const end = (e: TouchEvent) => {
      e.stopPropagation();
      if (!d || d.committed) return;
      const from = d.offset; d = null;
      if (!from) return;
      run = reduced ? null : animate(from, 0, { ...SPRING.settle, onUpdate: setY });
      if (reduced) setY(0);
    };
    const wheel = (e: WheelEvent) => { const p = panelEl.current; if (!p || !p.contains(e.target as Node) || p.scrollHeight <= p.clientHeight + 1) cancelable(e); };
    const opts = { passive: false } as const;
    el.addEventListener("touchstart", start, { passive: true }); el.addEventListener("touchmove", move, opts);
    el.addEventListener("touchend", end); el.addEventListener("touchcancel", end); el.addEventListener("wheel", wheel, opts);
    return () => {
      el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end); el.removeEventListener("wheel", wheel);
      run?.stop(); html.style.overscrollBehavior = prev[0]; body.style.overscrollBehavior = prev[1];
    };
  }, [reduced]);
  const view = useMemo(() => viewCard(card, "auto"), [card]);   // the feed's cutout when there is one, else the photo as before
  const price = formatPrice(card.price_cents, card.currency);
  const was = card.compare_at_cents && card.compare_at_cents > (card.price_cents ?? 0) ? formatPrice(card.compare_at_cents, card.currency) : null;
  return (
    <div ref={root} className={`fixed inset-0 z-40 touch-none ${present ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label={`${card.brand} ${card.name}`}>
      <m.button aria-label="Close" onClick={onClose} {...mo.backdrop} className="absolute inset-0 bg-black/30" />
      <div ref={wrap} className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md">
      <m.div ref={panelEl} {...mo.panel} className="max-h-[90dvh] w-full overflow-y-auto overscroll-y-contain rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 shadow-2xl" style={{ touchAction: "pan-y" }}>
        <div data-sheet-grab className="-mx-5 flex h-6 items-center justify-center"><div className="h-1 w-10 rounded-full bg-neutral-300" /></div>
        <div data-sheet-grab className="relative h-[52dvh] select-none bg-white [-webkit-touch-callout:none]" style={{ touchAction: "pan-y" }} onContextMenu={(e) => e.preventDefault()} {...imgGesture}>
          <FeedImage card={view} src={view.cut ? feedSrc(view, "top") : undefined} blend={!view.cut} noSale fill={0.96} minW={1000} priority />
          <LikePop ref={pop} />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider">{card.brand}</p>
            <p className="mt-0.5 text-base leading-snug text-neutral-800">{card.name}</p>
            {price && (
              <p className="mt-1 text-base">
                <span className="font-medium">{price}</span>
                {was && <span className="ml-2 text-sm text-neutral-400 line-through">{was}</span>}
              </p>
            )}
          </div>
          <Heart on={liked} onClick={onLike} size={26} label={liked ? "Remove like" : "Like"} />
        </div>
        <a href={outHref(card.id, "detail", feedVariant)} target="_blank" rel="noopener noreferrer" onClick={onViewProduct}
          className="mt-4 block rounded-full bg-black py-3 text-center text-sm font-medium text-white active:opacity-80">
          View product
        </a>
      </m.div>
      </div>
    </div>
  );
}
