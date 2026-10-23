"use client";
import { useEffect, useMemo, useRef } from "react";
import * as m from "motion/react-m";
import { useIsPresent } from "motion/react";
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
import { sheetCloseSwipe } from "@/lib/gestures";

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
  // swipe down = close COMMAND (no drag-follow, no spring-back): once a clear downward swipe is recognised the normal exit animation runs, once.
  // Only when the content is at the top, or the press began on the handle / image; the native non-passive touchmove keeps the feed behind out of it.
  const wrap = useRef<HTMLDivElement>(null), panelEl = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; t: number; zone: boolean; done: boolean } | null>(null);
  const sheetDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe.current = { x: e.clientX, y: e.clientY, t: Date.now(), zone: !!(e.target as HTMLElement).closest("[data-sheet-grab]"), done: false };
  };
  const sheetMove = (e: React.PointerEvent) => {
    const d = swipe.current; if (!d || d.done) return;
    if (!sheetCloseSwipe(e.clientX - d.x, e.clientY - d.y, Date.now() - d.t, panelEl.current?.scrollTop ?? 0, d.zone)) return;
    d.done = true; pg.current.cancel(); onClose();
  };
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const stop = (e: TouchEvent) => { if (swipe.current?.done && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);
  const view = useMemo(() => viewCard(card, "auto"), [card]);   // the feed's cutout when there is one, else the photo as before
  const price = formatPrice(card.price_cents, card.currency);
  const was = card.compare_at_cents && card.compare_at_cents > (card.price_cents ?? 0) ? formatPrice(card.compare_at_cents, card.currency) : null;
  return (
    <div className={`fixed inset-0 z-40 touch-none ${present ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label={`${card.brand} ${card.name}`}>
      <m.button aria-label="Close" onClick={onClose} {...mo.backdrop} className="absolute inset-0 bg-black/30" />
      <div ref={wrap} className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md" onPointerDown={sheetDown} onPointerMove={sheetMove} onPointerUp={() => { swipe.current = null; }} onPointerCancel={() => { swipe.current = null; }}>
      <m.div ref={panelEl} {...mo.panel} className="max-h-[90dvh] w-full overflow-y-auto overscroll-contain rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 shadow-2xl" style={{ touchAction: "pan-y" }}>
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
