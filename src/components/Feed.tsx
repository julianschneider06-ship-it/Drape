"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedCard, FeedOutfit, FeedResponse } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { feedSrc } from "@/lib/client/format";
import { track } from "@/lib/client/track";
import FeedImage from "./FeedImage";
import Heart from "./Heart";
import ProductSheet from "./ProductSheet";

type Gender = "women" | "men";
type SlotName = "top" | "bottom" | "shoes" | "full";
interface SheetState { card: FeedCard; outfit: FeedOutfit; index: number; slot: SlotName }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// One slot: a product image on white (backdrop blended in), tap = open sheet, heart in the corner.
function Slot({ card, tall, liked, onOpen, onLike, priority }: { card: FeedCard; tall?: boolean; liked: boolean; onOpen: () => void; onLike: () => void; priority: boolean }) {
  return (
    <div className={`relative w-full ${tall ? "h-[calc((100dvh-9.5rem)*2/3)]" : "h-[calc((100dvh-9.5rem)/3)]"}`}>
      <button type="button" onClick={onOpen} aria-label={`${card.brand} ${card.name}`} className="absolute inset-0">
        <FeedImage card={card} tall={tall} priority={priority} />
      </button>
      <div className="absolute bottom-1 right-1">
        <Heart on={liked} onClick={(e) => { e.stopPropagation(); onLike(); }} label={liked ? "Remove like" : "Like"} />
      </div>
    </div>
  );
}

export default function Feed() {
  const [gender, setGender] = useState<Gender | null>(null);
  const [items, setItems] = useState<FeedOutfit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [current, setCurrent] = useState(0);

  const device = useRef("");
  const scroller = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<FeedOutfit[]>([]);
  const cursorRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const genderRef = useRef<Gender>("women");
  const enterAt = useRef(new Map<number, number>());
  const interacted = useRef(new Set<number>());
  const prefetched = useRef(new Set<string>());
  const exhausted = useRef(false);
  itemsRef.current = items;

  // first load: device id, remembered gender, likes
  useEffect(() => {
    device.current = getDeviceId();
    const g = (store.get("drape.gender") === "men" ? "men" : "women") as Gender;
    genderRef.current = g;
    setGender(g);
    fetch(`/api/likes?device=${device.current}`).then((r) => (r.ok ? r.json() : null)).then((j: { items: { product: FeedCard }[] } | null) => {
      if (j) setLiked(new Set(j.items.map((i) => i.product.id)));
    }).catch(() => { /* likes are optional for browsing */ });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhausted.current) return;
    loadingRef.current = true; setLoading(true); setError(false);
    const g = genderRef.current;
    try {
      const q = new URLSearchParams({ gender: g, device: device.current, limit: "6" });
      if (cursorRef.current !== null) q.set("cursor", String(cursorRef.current));
      const res = await fetch(`/api/feed?${q}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as FeedResponse;
      if (g !== genderRef.current) return; // gender changed while loading
      cursorRef.current = data.next_cursor;
      store.set(`drape.cursor.${g}`, String(data.next_cursor));
      if (!data.items.length && data.size === 0) exhausted.current = true;
      setItems((prev) => { const seen = new Set(prev.map((o) => o.id)); return [...prev, ...data.items.filter((o) => !seen.has(o.id))]; });
    } catch { setError(true); }
    finally { loadingRef.current = false; setLoading(false); }
  }, []);

  // (re)start the feed whenever the gender changes
  useEffect(() => {
    if (!gender) return;
    genderRef.current = gender;
    store.set("drape.gender", gender);
    const saved = store.get(`drape.cursor.${gender}`);
    cursorRef.current = saved !== null && /^\d+$/.test(saved) ? Number(saved) : null;
    exhausted.current = false; enterAt.current.clear(); interacted.current.clear();
    setItems([]); setCurrent(0);
    scroller.current?.scrollTo({ top: 0 });
    loadingRef.current = false;
    loadMore();
  }, [gender, loadMore]);

  // impressions, dwell time, scroll-past (IntersectionObserver on each outfit screen)
  useEffect(() => {
    const root = scroller.current;
    if (!root || !items.length) return;
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.i);
        const o = itemsRef.current[i];
        if (!o) continue;
        const ids = [o.top.id, ...(o.bottom ? [o.bottom.id] : []), o.shoes.id];
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          if (!enterAt.current.has(i)) {
            enterAt.current.set(i, Date.now());
            setCurrent(i);
            track({ event_type: "impression", outfit_id: o.id, product_ids: ids, feed_index: i, gender: genderRef.current });
          }
        } else if (enterAt.current.has(i) && e.intersectionRatio < 0.3) {
          const dwell = Date.now() - (enterAt.current.get(i) ?? Date.now());
          enterAt.current.delete(i);
          track({ event_type: "dwell_ms", outfit_id: o.id, product_ids: ids, feed_index: i, gender: genderRef.current, dwell_ms: dwell });
          if (dwell < 1000 && !interacted.current.has(i)) track({ event_type: "scroll_past", outfit_id: o.id, product_ids: ids, feed_index: i, gender: genderRef.current });
        }
      }
    }, { root, threshold: [0, 0.3, 0.6] });
    root.querySelectorAll("section[data-i]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items.length]);

  // prefetch the next 3 outfits' images; load more when close to the end
  useEffect(() => {
    for (let k = 1; k <= 3; k++) {
      const o = items[current + k];
      if (!o) continue;
      for (const c of [o.top, o.bottom, o.shoes]) {
        if (!c) continue;
        const u = feedSrc(c, c === o.top && o.kind === "full");
        if (!prefetched.current.has(u)) { prefetched.current.add(u); const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = u; }
      }
    }
    if (items.length && current >= items.length - 4) loadMore();
  }, [current, items, loadMore]);

  const toggleLike = useCallback((card: FeedCard, outfit: FeedOutfit | null, index: number, slot: SlotName | "sheet") => {
    const want = !liked.has(card.id);
    setLiked((prev) => { const n = new Set(prev); if (want) n.add(card.id); else n.delete(card.id); return n; });
    if (outfit) interacted.current.add(index);
    fetch("/api/likes", {
      method: "POST",
      body: JSON.stringify({ device_id: device.current, product_id: card.id, liked: want, outfit_id: outfit?.id, feed_index: index, slot: slot === "sheet" ? "sheet" : slot, gender: genderRef.current }),
    }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => {
      setLiked((prev) => { const n = new Set(prev); if (want) n.delete(card.id); else n.add(card.id); return n; }); // revert
    });
  }, [liked]);

  const open = (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => {
    interacted.current.add(index);
    track({ event_type: "tap_product", product_id: card.id, outfit_id: outfit.id, feed_index: index, slot, gender: genderRef.current });
    setSheet({ card, outfit, index, slot });
  };

  return (
    <main className="h-dvh bg-white">
      <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-white/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <span className="w-16 text-lg font-semibold tracking-tight">Drape</span>
        <div className="flex rounded-full bg-neutral-100 p-0.5 text-sm" role="tablist" aria-label="Section">
          {(["women", "men"] as Gender[]).map((g) => (
            <button key={g} role="tab" aria-selected={gender === g} onClick={() => gender !== g && setGender(g)}
              className={`rounded-full px-4 py-1 capitalize transition-colors ${gender === g ? "bg-black text-white" : "text-neutral-600"}`}>{g === "women" ? "Women" : "Men"}</button>
          ))}
        </div>
        <Link href="/likes" aria-label="My likes" className="flex w-16 justify-end">
          <span className="rounded-full p-1.5 text-black">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" /></svg>
          </span>
        </Link>
      </header>

      <div ref={scroller} className="no-scrollbar h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-y-contain">
        {items.map((o, i) => (
          <section key={o.id} data-i={i} className="flex h-dvh snap-start snap-always flex-col items-center justify-center pb-5 pt-[3.75rem]">
            <div className="flex w-[min(84vw,22rem)] flex-col">
              {o.kind === "full" ? (
                <Slot card={o.top} tall liked={liked.has(o.top.id)} priority={i < 2} onOpen={() => open(o.top, o, i, "full")} onLike={() => toggleLike(o.top, o, i, "full")} />
              ) : (
                <>
                  <Slot card={o.top} liked={liked.has(o.top.id)} priority={i < 2} onOpen={() => open(o.top, o, i, "top")} onLike={() => toggleLike(o.top, o, i, "top")} />
                  {o.bottom && <Slot card={o.bottom} liked={liked.has(o.bottom.id)} priority={i < 2} onOpen={() => open(o.bottom!, o, i, "bottom")} onLike={() => toggleLike(o.bottom!, o, i, "bottom")} />}
                </>
              )}
              <Slot card={o.shoes} liked={liked.has(o.shoes.id)} priority={i < 2} onOpen={() => open(o.shoes, o, i, "shoes")} onLike={() => toggleLike(o.shoes, o, i, "shoes")} />
            </div>
          </section>
        ))}
        {!items.length && (
          <section className="flex h-dvh items-center justify-center text-sm text-neutral-400">
            {error ? <button onClick={() => loadMore()} className="rounded-full border border-neutral-300 px-4 py-2 text-neutral-700">Try again</button> : loading || !gender ? "Loading…" : "No outfits yet."}
          </section>
        )}
      </div>

      {sheet && (
        <ProductSheet card={sheet.card} liked={liked.has(sheet.card.id)} onClose={() => setSheet(null)}
          onLike={() => toggleLike(sheet.card, sheet.outfit, sheet.index, "sheet")}
          onViewProduct={() => track({ event_type: "view_product_click", product_id: sheet.card.id, outfit_id: sheet.outfit.id, feed_index: sheet.index, slot: "sheet", gender: genderRef.current })} />
      )}
    </main>
  );
}
