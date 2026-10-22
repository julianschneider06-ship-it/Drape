"use client";
import * as m from "motion/react-m";
import { MENU } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide } from "@/lib/menu-motion";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import { canvasSize } from "@/lib/layout/engine";
import { HEADER_PX } from "@/lib/layout/config";
import { isFiller } from "@/lib/wishlist-outfits";
import OutfitCanvas from "./OutfitCanvas";

type Status = "loading" | "ready" | "empty" | "error";
const MAX_MISSES = 3;   // pages in a row without any outfit before the list ends
const dims = new WeakMap<FeedOutfit, (slot: SlotName) => boolean>();   // one stable callback per outfit (the canvas re-checks sale labels when it changes)
const dimFor = (o: FeedOutfit) => { let f = dims.get(o); if (!f) { f = (slot) => isFiller(o, slot); dims.set(o, f); } return f; };

/** Wishlist > Generate Outfits: a vertical feed of outfits built from the liked products; filler pieces are greyed out and cannot be tapped. Nothing is recorded by generating. */
function GenerateOutfits({ gender, likedIds, shuffleKey, onOpen, onLike }: {
  gender: "women" | "men"; likedIds: number[]; shuffleKey: number;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onLike: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => boolean;
}) {
  const root = useRef<HTMLDivElement>(null), tail = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [canvas, setCanvas] = useState<{ w: number; h: number } | null>(null);
  const [items, setItems] = useState<FeedOutfit[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [more, setMore] = useState(false);
  const likedRef = useRef(likedIds); likedRef.current = likedIds;
  const run = useRef({ gen: 0, seed: 0, next: 0, busy: false, misses: 0, ids: [] as number[], last: [] as number[] });

  const load = useCallback(async () => {
    const r = run.current; if (r.busy) return;
    r.busy = true; const mine = r.gen; setMore(true);
    try {
      const res = await fetch("/api/wishlist-outfits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gender, ids: r.ids, seed: r.seed, from: r.next, prev: r.last }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { items: FeedOutfit[]; usable: number; next: number };
      if (mine !== r.gen) return;
      r.next = j.next; r.misses = j.items.length ? 0 : r.misses + 1;
      if (j.items.length) r.last = j.items[j.items.length - 1].dyn?.ids ?? [];
      setItems((cur) => [...cur, ...j.items]);
      setStatus(j.usable === 0 || r.misses >= MAX_MISSES ? "empty" : "ready");
    } catch { if (mine === r.gen) setStatus((s) => (s === "ready" ? s : "error")); }
    finally { if (mine === r.gen) { r.busy = false; setMore(false); } }
  }, [gender]);

  useEffect(() => {   // a new generation on every visit, on a direction change and on Shuffle; the liked list is read once so the outfits stay stable while scrolling
    const r = run.current; r.gen++; r.busy = false; r.misses = 0; r.next = 0; r.last = []; r.seed = Math.floor(Math.random() * 2 ** 31); r.ids = likedRef.current.slice();
    setItems([]); setMore(false);
    if (!r.ids.length) { setStatus("empty"); return; }
    setStatus("loading"); load();
  }, [gender, shuffleKey, load]);

  useEffect(() => {   // canvas follows the area under the Wishlist header (no bottom strip, no rail)
    const el = root.current; if (!el) return;
    const measure = () => setCanvas((p) => { const n = canvasSize(el.clientWidth, el.clientHeight + HEADER_PX - 8, 0, { barPx: 0 }); return p && p.w === n.w && p.h === n.h ? p : n; });
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {   // next page when the end of the list comes within about one screen (an observer on the last section, no polling)
    const el = tail.current, rootEl = root.current;
    if (!el || !rootEl || status === "empty" || more) return;
    if (status === "error" && !items.length) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) load(); }, { root: rootEl, rootMargin: "100% 0px" });
    io.observe(el); return () => io.disconnect();
  }, [status, more, items.length, load]);

  return (
    <div ref={root} className="no-scrollbar absolute inset-0 snap-y snap-mandatory overflow-y-scroll overscroll-y-contain bg-white">
      {status === "empty" && !items.length && (
        <m.section className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center" {...fadeSlide(reduced, MENU.hintShiftPx)}>
          <p className="text-sm text-neutral-500">{likedIds.length || run.current.ids.length ? "No outfits could be built from your wishlist yet." : "Like some pieces to generate outfits"}</p>
        </m.section>
      )}
      {canvas && items.map((o, i) => (
        <section key={`${i}:${o.id}`} data-i={i} className="relative flex h-full snap-start snap-always flex-col items-center justify-center">
          <OutfitCanvas outfit={o} canvas={canvas} priority={i < 2} dim={dimFor(o)} onOpen={(c, slot) => onOpen(c, o, i, slot)} onLike={(c, slot) => onLike(c, o, i, slot)} />
        </section>
      ))}
      {status !== "empty" && (
        <section ref={tail} className="flex h-full snap-start flex-col items-center justify-center gap-3 px-8 text-center">
          <p className="text-sm text-neutral-400">{status === "error" ? "Could not load outfits." : "Loading…"}</p>
          {status === "error" && <button type="button" onClick={() => { setStatus("loading"); load(); }} className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm text-neutral-700">Try again</button>}
        </section>
      )}
    </div>
  );
}
export default memo(GenerateOutfits);
