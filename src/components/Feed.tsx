"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedCard, FeedOutfit, FeedResponse } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { track } from "@/lib/client/track";
import OutfitCanvas, { pieceClass } from "./OutfitCanvas";
import { canvasSize } from "@/lib/layout/engine";
import ProductSheet from "./ProductSheet";
import OutfitButtons, { type Reaction } from "./OutfitButtons";
import { BUTTON_BAR_PX } from "@/lib/layout/config";
import type { SlotName } from "@/lib/layout/engine";

type Gender = "women" | "men";
interface SheetState { card: FeedCard; outfit: FeedOutfit; index: number; slot: SlotName }

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

export default function Feed() {
  const [gender, setGender] = useState<Gender | null>(null);
  const [items, setItems] = useState<FeedOutfit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [current, setCurrent] = useState(0);
  const [canvas, setCanvas] = useState<{ w: number; h: number } | null>(null);
  const [reactions, setReactions] = useState<Record<number, Reaction>>({});
  const layoutInfo = useRef(new Map<number, { layout: string; mode: string }>());
  const [dbg, setDbg] = useState<{ layout?: string[]; debug: boolean; cut: CutMode }>({ debug: false, cut: "auto" });

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

  // remembered outfit reactions (this device)
  useEffect(() => { try { const r = JSON.parse(store.get("drape.reactions") ?? "{}"); if (r && typeof r === "object") setReactions(r); } catch { /* ignore */ } }, []);

  // debug options: ?layout=A,FB forces templates (3-piece, full-body), ?debug=1 shows boxes + margin zone
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setDbg({ layout: q.get("layout")?.split(",").filter(Boolean), debug: q.get("debug") === "1", cut: q.get("cut") === "off" ? "off" : "auto" });
  }, []);

  // canvas size follows the scroller (phones, rotation, desktop)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // the phone's bottom safe area (home indicator) is resolved by the browser; read it through a probe element
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const measure = () => setCanvas((p) => { const safe = parseFloat(getComputedStyle(probe).paddingBottom) || 0; const n = canvasSize(el.clientWidth, el.clientHeight, safe); return p && p.w === n.w && p.h === n.h ? p : n; });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); probe.remove(); };
  }, []);

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
      const q = new URLSearchParams({ gender: g });
      if (cursorRef.current !== null) q.set("cursor", String(cursorRef.current)); else q.set("device", device.current); // pages with a cursor are shared + CDN-cached
      let res = await fetch(`/api/feed?${q}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!res || !res.ok) res = await fetch(`/api/feed?${q}`, { signal: AbortSignal.timeout(10000) }); // one automatic retry
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
      for (const [c, slot] of [[o.top, o.kind === "full" ? "full" : "top"], [o.bottom, "bottom"], [o.shoes, "shoes"]] as const) {
        if (!c) continue;
        const u = feedSrc(viewCard(c, dbg.cut), pieceClass(slot, c));
        if (!prefetched.current.has(u)) { prefetched.current.add(u); const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = u; }
      }
    }
    if (items.length && current >= items.length - 4) loadMore();
  }, [current, items, loadMore, dbg.cut]);

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

  // Outfit-level signal buttons (up = like this outfit, down = do not like it). Toggle: other button switches, same again clears.
  // Only logged (append-only event log); nothing else changes and the feed does not move.
  const pressOutfit = (o: FeedOutfit, index: number, dir: Reaction) => {
    const prev = reactions[o.id];
    const next = prev === dir ? null : dir;
    setReactions((r) => { const n = { ...r }; if (next) n[o.id] = next; else delete n[o.id]; store.set("drape.reactions", JSON.stringify(Object.fromEntries(Object.entries(n).slice(-400)))); return n; });
    const info = layoutInfo.current.get(o.id);
    track({
      event_type: next ? (next === "up" ? "outfit_up" : "outfit_down") : "outfit_clear", outfit_id: o.id, feed_index: index, gender: genderRef.current,
      product_ids: [o.top.id, ...(o.bottom ? [o.bottom.id] : []), o.shoes.id],
      ctx: { layout: info?.layout, mode: info?.mode, canvas: canvas ? [canvas.w, canvas.h] : undefined, v: "v3.1", ...(prev && next !== prev ? { prev } : {}) },
    });
  };

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
          <section key={o.id} data-i={i} className="relative flex h-dvh snap-start snap-always flex-col items-center justify-center pt-[3.75rem]" style={{ paddingBottom: `calc(${BUTTON_BAR_PX}px + env(safe-area-inset-bottom))` }}>
            {canvas && <OutfitCanvas outfit={o} canvas={canvas} override={dbg.layout} debug={dbg.debug} cut={dbg.cut} priority={i < 2}               onOpen={(c, slot) => open(c, o, i, slot)}
              onLayout={(layout, mode) => layoutInfo.current.set(o.id, { layout, mode })} />}
            <OutfitButtons value={reactions[o.id] ?? null} onPress={(d) => pressOutfit(o, i, d)} />
          </section>
        ))}
        {!items.length && (
          <section className="flex h-dvh items-center justify-center text-sm text-neutral-400">
            {error ? <button onClick={() => loadMore()} className="rounded-full border border-neutral-300 px-4 py-2 text-neutral-700">Try again</button> : loading || !gender ? "Loading…" : "No outfits yet."}
          </section>
        )}
      </div>

      {dbg.debug && (
        <button onClick={() => setDbg((d) => ({ ...d, cut: d.cut === "auto" ? "off" : "auto" }))}
          className="fixed bottom-3 left-3 z-50 rounded bg-black px-2 py-1 text-xs text-white">cutouts: {dbg.cut === "auto" ? "on" : "off (originals)"}</button>
      )}

      {sheet && (
        <ProductSheet card={sheet.card} liked={liked.has(sheet.card.id)} onClose={() => setSheet(null)}
          onLike={() => toggleLike(sheet.card, sheet.outfit, sheet.index, "sheet")}
          onViewProduct={() => track({ event_type: "view_product_click", product_id: sheet.card.id, outfit_id: sheet.outfit.id, feed_index: sheet.index, slot: "sheet", gender: genderRef.current })} />
      )}
    </main>
  );
}
