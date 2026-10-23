"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { outHref } from "@/lib/client/out-url";
import * as m from "motion/react-m";
import { MENU } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide } from "@/lib/menu-motion";
import Heart from "@/components/Heart";
import type { FeedCard } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { formatPrice, feedSrc, viewCard } from "@/lib/client/format";
import { applyFilter, chipsFor, effectiveFilter, type LikesFilter } from "@/lib/likes-filter";
import { useSaleMarker } from "@/lib/client/sale";
import { priceDisplay } from "@/lib/price-display";
import FeedImage from "@/components/FeedImage";
import { track } from "@/lib/client/track";
import { WISHLIST_HEART } from "@/config/wishlist";
import { LIKES_GRID_DEFAULT, LIKES_GRID_HEART, LIKES_GRID_KEY, LIKES_GRID_LOOK } from "@/config/likes-grid";
import { fieldsFor, nextCols, parseCols } from "@/lib/likes-grid";

/** Grid button icon: `n` columns x 2 rows of small squares. */
function GridIcon({ n }: { n: number }) {
  const w = 16 / n - 1.5;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      {[0, 1].flatMap((r) => Array.from({ length: n }, (_, c) => <rect key={`${r}${c}`} x={0.6 + c * (16 / n)} y={0.6 + r * 8} width={w} height={6.8} rx="0.8" />))}
    </svg>
  );
}
import { heartLook, heartVisual, refreshItems } from "@/lib/wishlist-soft";

/** Minimal "Wishlist" products list (the full "My collection" comes later): products this anonymous device liked. Used by the Wishlist tab and by the /likes page. */
export default function LikesView({ liked, onToggle }: { liked?: Set<number>; onToggle?: (card: FeedCard) => void }) {
  const reduced = useReducedMotion();
  const saleOn = useSaleMarker();
  const [items, setItems] = useState<FeedCard[] | null>(null);
  const [error, setError] = useState(false);
  const [device, setDevice] = useState("");
  const [local, setLocal] = useState<Set<number>>(new Set());   // standalone (/likes page): the likes of this visit; in the Wishlist tab the feed's set is used
  const [filter, setFilter] = useState<LikesFilter>("all");   // local only; the Wishlist view is unmounted when the tab is left, so it resets to All
  const [cols, setCols] = useState<number>(LIKES_GRID_DEFAULT);   // device-only choice, kept in localStorage (not reset when the tab is left)
  const listRef = useRef<HTMLUListElement>(null);
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const likedRef = useRef(liked); likedRef.current = liked;

  useEffect(() => {
    const d = getDeviceId();
    setDevice(d);
    fetch(`/api/likes?device=${d}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: { items: { product: FeedCard }[] }) => { const all = j.items.map((i) => i.product); setItems(likedRef.current ? refreshItems(all, likedRef.current) : all); if (!likedRef.current) setLocal(new Set(all.map((c) => c.id))); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => { try { setCols(parseCols(localStorage.getItem(LIKES_GRID_KEY))); } catch { /* storage blocked: default */ } }, []);
  const scroller = (): HTMLElement | null => {
    for (let e: HTMLElement | null = topRef.current; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) return e;
    return null;
  };
  const cycle = () => {
    const n = nextCols(cols);
    // remember the first product at/under the top of the viewport so it stays roughly there after the reflow
    const topEdge = scroller()?.getBoundingClientRect().top ?? 0;
    const li = Array.from(listRef.current?.children ?? []).find((e) => e.getBoundingClientRect().bottom > topEdge + 44) as HTMLElement | undefined;
    anchor.current = li ? { id: li.dataset.id ?? "", top: li.getBoundingClientRect().top } : null;
    setCols(n);
    try { localStorage.setItem(LIKES_GRID_KEY, String(n)); } catch { /* ignore */ }
  };
  useLayoutEffect(() => {
    const a = anchor.current; anchor.current = null;
    const li = a && (Array.from(listRef.current?.children ?? []).find((e) => (e as HTMLElement).dataset.id === a.id) as HTMLElement | undefined);
    if (!a || !li) return;
    const d = li.getBoundingClientRect().top - a.top;
    const sc = scroller();
    if (sc) sc.scrollTop += d; else window.scrollBy(0, d);
  }, [cols]);

  const isLiked = (id: number) => (liked ?? local).has(id);
  // soft unlike: the product stays listed (white heart) and can be liked again; the list only refreshes when the Wishlist is entered again
  const toggle = (c: FeedCard) => {
    if (onToggle) return onToggle(c);   // the feed's normal like path (taste signal, event row, sync everywhere)
    const want = !local.has(c.id);
    setLocal((prev) => { const n = new Set(prev); if (want) n.add(c.id); else n.delete(c.id); return n; });
    fetch("/api/likes", { method: "POST", body: JSON.stringify({ device_id: device, product_id: c.id, liked: want, slot: "sheet" }) }).catch(() => setError(true));
  };

  const chips = chipsFor(items ?? []), active = effectiveFilter(filter, items ?? []);
  const pick = (f: LikesFilter) => {
    setFilter(f);
    for (let e: HTMLElement | null = topRef.current; e; e = e.parentElement) if (e.scrollHeight > e.clientHeight && /(auto|scroll)/.test(getComputedStyle(e).overflowY)) { e.scrollTop = 0; return; }
    window.scrollTo(0, 0);   // standalone /likes page scrolls the window
  };

  const look = LIKES_GRID_LOOK[cols] ?? LIKES_GRID_LOOK[LIKES_GRID_DEFAULT], f = fieldsFor(cols);
  return (
    <>
      <div ref={topRef} />
      {(chips.length > 1 || (items && items.length > 0)) && (
        <div className="sticky top-0 z-10 -mx-3 flex items-center gap-2 bg-white px-3 py-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto" role="group" aria-label="Filter by type">
            {chips.length > 1 && chips.map((c) => (
              <button key={c.id} type="button" onClick={() => pick(c.id)} aria-pressed={active === c.id}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${active === c.id ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-black"}`}>{c.label}</button>
            ))}
          </div>
          <button type="button" onClick={cycle} aria-label="Grid density" title={`${nextCols(cols)} columns next`}
            className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs text-black">
            <GridIcon n={nextCols(cols)} /><span className="tabular-nums">{nextCols(cols)}</span>
          </button>
        </div>
      )}
      {error && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="py-10 text-center text-sm text-neutral-500">Could not load your wishlist.</m.p>}
      {items && items.length === 0 && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="py-16 text-center text-sm text-neutral-500">Nothing liked yet. Tap the heart on a piece you like.</m.p>}
      <ul ref={listRef} className={`grid ${look.gap}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {applyFilter(items ?? [], active).map((c) => (
          <li key={c.id} data-id={c.id} className="relative min-w-0">
            <div className="relative aspect-[3/4] bg-white">{(() => { const v = viewCard(c, "auto"); return <FeedImage card={v} src={v.cut ? feedSrc(v, "top") : undefined} blend={!v.cut} noSale fill={look.fill} minW={look.imgW} />; })()}</div>
            <div className="absolute right-0 top-0"><Heart on={isLiked(c.id)} look={heartVisual(heartLook(c.id, liked ?? local), WISHLIST_HEART)} onClick={() => toggle(c)} label={isLiked(c.id) ? "Remove like" : "Like"} size={cols === 2 ? WISHLIST_HEART.size : LIKES_GRID_HEART} /></div>
            {f.brand && <p className="mt-1 truncate text-xs font-semibold uppercase tracking-wide">{c.brand}</p>}
            {f.name && <p className="line-clamp-2 text-sm text-neutral-600">{c.name}</p>}
            {(() => { const p = priceDisplay(c, saleOn); return (
              <p className={`mt-0.5 flex min-w-0 items-baseline gap-x-1.5 ${look.price} ${cols === 2 ? "flex-wrap" : "overflow-hidden whitespace-nowrap"}`}>
                <span className={cols === 2 ? "" : "shrink-0"}>{formatPrice(p.now, c.currency)}</span>
                {f.oldPrice && p.was !== null && <span className={`text-xs text-neutral-400 line-through ${cols === 2 ? "" : "min-w-0 truncate"}`}>{formatPrice(p.was, c.currency)}</span>}
              </p>); })()}
            {f.link && <a href={outHref(c.id, "wishlist")} target="_blank" rel="noopener noreferrer" onClick={() => track({ event_type: "view_product_click", product_id: c.id, slot: "sheet" })}
              className="mt-1 inline-block text-xs underline underline-offset-2">View product</a>}
          </li>
        ))}
      </ul>
    </>
  );
}
