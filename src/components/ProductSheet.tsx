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
import { animate } from "motion/react";
import { sheetDismiss, sheetDragStarts } from "@/lib/gestures";
import { DURATION_MS, SPRING } from "@/config/motion";

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
  // swipe down to close: the wrapper follows the finger (transform only), released past SHEET_DISMISS_RATIO / with a fast flick it leaves, else it springs back.
  // Drag starts only when the content is at the top, or when the press began on the handle / image; the native non-passive touchmove keeps the feed behind out of it.
  const wrap = useRef<HTMLDivElement>(null), panelEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; zone: boolean; on: boolean; dy: number; s: { t: number; y: number }[] } | null>(null);
  const sheetDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const zone = !!(e.target as HTMLElement).closest("[data-sheet-grab]");
    drag.current = { x: e.clientX, y: e.clientY, zone, on: false, dy: 0, s: [{ t: Date.now(), y: e.clientY }] };
  };
  const sheetMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) { if (!sheetDragStarts(dx, dy, panelEl.current?.scrollTop ?? 0, d.zone)) return; d.on = true; pg.current.cancel(); }
    d.dy = Math.max(0, dy);
    const now = Date.now(); d.s.push({ t: now, y: e.clientY }); while (d.s.length > 2 && now - d.s[1].t > 80) d.s.shift();
    if (wrap.current) wrap.current.style.transform = `translate3d(0, ${d.dy}px, 0)`;
  };
  const sheetUp = () => {
    const d = drag.current; drag.current = null;
    if (!d || !d.on || !wrap.current) return;
    const first = d.s[0], last = d.s[d.s.length - 1], vy = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
    const h = wrap.current.offsetHeight, el = wrap.current;
    if (sheetDismiss(d.dy, h, vy)) animate(el, { y: h }, reduced ? { duration: DURATION_MS.reducedFade / 1000 } : { duration: DURATION_MS.sheetOut / 1000, ease: "easeIn" }).then(onClose);
    else animate(el, { y: 0 }, reduced ? { duration: DURATION_MS.reducedFade / 1000 } : SPRING.settle).then(() => { el.style.transform = ""; });
  };
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const stop = (e: TouchEvent) => { if (drag.current?.on && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);
  const view = useMemo(() => viewCard(card, "auto"), [card]);   // the feed's cutout when there is one, else the photo as before
  const price = formatPrice(card.price_cents, card.currency);
  const was = card.compare_at_cents && card.compare_at_cents > (card.price_cents ?? 0) ? formatPrice(card.compare_at_cents, card.currency) : null;
  return (
    <div className={`fixed inset-0 z-40 touch-none ${present ? "" : "pointer-events-none"}`} role="dialog" aria-modal="true" aria-label={`${card.brand} ${card.name}`}>
      <m.button aria-label="Close" onClick={onClose} {...mo.backdrop} className="absolute inset-0 bg-black/30" />
      <div ref={wrap} className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-md" onPointerDown={sheetDown} onPointerMove={sheetMove} onPointerUp={sheetUp} onPointerCancel={() => { drag.current = null; if (wrap.current) wrap.current.style.transform = ""; }}>
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
