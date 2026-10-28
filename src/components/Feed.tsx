"use client";
import { feedDoubleTap } from "@/lib/product-gesture";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedCard, FeedOutfit, FeedResponse } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { feedSrc, viewCard, type CutMode } from "@/lib/client/format";
import { track } from "@/lib/client/track";
import OutfitCanvas, { pieceClass } from "./OutfitCanvas";
import { canvasSize } from "@/lib/layout/engine";
import ProductSheet from "./ProductSheet";
import ActionRail, { heartAction } from "./ActionRail";
import { railIndex } from "@/lib/rail-state";
import { ACTION_RAIL_WIDTH } from "@/config/action-rail";
import { heartState, heartToggle, outfitPieces } from "@/lib/outfit-heart";
import { SaleInkDefs, setSaleDefault } from "@/lib/client/sale";
import TutorialFeed from "./TutorialFeed";
import Welcome from "./Welcome";
import BottomNav, { NAV_PX, type Tab } from "./BottomNav";
import WishlistView, { type WishTab } from "./WishlistView";
import ProfileView from "./ProfileView";
import { hasShopPrefs, shopPrefParam } from "@/lib/client/profile-store";
import { navVisible, tabLayers } from "@/lib/nav-tabs";
import { AnimatePresence } from "motion/react";
import MotionRoot from "./MotionRoot";
import Layer from "./Layer";
import Segmented from "./Segmented";
import Search from "./Search";
import OutfitIcons from "./OutfitIcons";
import { outfitIcons } from "@/lib/outfit-icons";
import { STYLES_GENDER_KEY, STYLES_KEY, cleanStyles } from "@/lib/welcome";
import { ONBOARDING_KEY } from "@/lib/onboarding";
import { compactTags } from "@/outfits/tags";
import type { Signal } from "@/outfits/taste-codec";
import { likeSignal } from "@/lib/like-signal";
import { TASTE } from "@/lib/personalization/config";
import SeasonDecor from "./SeasonDecor";
import { dominantSeason } from "@/lib/season-decor";
import { useSeasonDecor } from "@/lib/client/season-decor";
import { applySwaps, loopSize, slotKeyOf, type SwapEvt, type SwapState } from "@/lib/client/swap";
import type { SlotName } from "@/lib/layout/engine";

type Gender = "women" | "men";
interface SheetState { card: FeedCard; outfit: FeedOutfit | null; index: number; slot: SlotName }
const trackSlot = (s: SlotName) => (s.startsWith("acc") ? "accessory" : s) as "top" | "bottom" | "shoes" | "full" | "accessory";

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

const PERSONALIZE_FROM = TASTE.personalizeFrom, OUTBOX_MAX = TASTE.outboxMax;
const DECOR_BOX = { height: "calc(100dvh - var(--nav-h, 0px))" } as const;   // same box as the feed scroller
const shownIds = (o: FeedOutfit) => [o.top.id, ...(o.bottom ? [o.bottom.id] : []), o.shoes.id];
const tg = (o: FeedOutfit) => (o.tags ? (({ se, oc, pk, si, fo, w, ct }) => ({ se, oc, pk, si, fo, w, ct }))(compactTags(o.tags)) : null);

/** the styles picked on the welcome screen, only for the gender they were picked for (they stay on this device) */
function pickedStyles(g: Gender): string[] {
  try { return store.get(STYLES_GENDER_KEY) === g ? cleanStyles(JSON.parse(store.get(STYLES_KEY) ?? "[]")) : []; } catch { return []; }
}

export default function Feed({ defaults }: { defaults?: { feed: "base" | "dynamic" | "hybrid"; sale: boolean; icons?: boolean; search?: boolean; customize?: boolean } }) {
  setSaleDefault(defaults?.sale);   // app_settings.sale_marker_enabled (?sale=on|off still overrides)
  const [gender, setGender] = useState<Gender | null>(null);
  const [iconsOn, setIconsOn] = useState(defaults?.icons !== false);   // app_settings.icons_enabled; ?icons=0 / ?icons=1 override it
  // bottom bar + Search tab (app_settings.search_enabled; ?search=0 hides both). Both tabs stay mounted: switching only toggles visibility, so For You keeps its scroll position and records nothing.
  const [searchOn, setSearchOn] = useState(defaults?.search !== false);
  const [customizeOn, setCustomizeOn] = useState(defaults?.customize === true);   // app_settings.liked_outfit_customizable_enabled (My Outfits accessory layout); ?customize=1 / ?customize=0 override it
  const [navReady, setNavReady] = useState(false);   // false until the first-visit check ran (no bar flash before the welcome flow)
  const [tab, setTab] = useState<Tab>("foryou");
  const [searchSeen, setSearchSeen] = useState(false);
  const [searchTap, setSearchTap] = useState(0);
  const tabRef = useRef<Tab>("foryou"), awayAt = useRef(0), searchStarted = useRef(false);
  const [items, setItems] = useState<FeedOutfit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [wishTab, setWishTab] = useState<WishTab>("products");   // Wishlist view (Products | Generate Outfits), kept while the app is open
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [current, setCurrent] = useState(0);
  const [railIdx, setRailIdx] = useState(0);   // outfit the fixed action rail belongs to (nearest snap position, flips at the halfway point of a scroll)
  const [canvas, setCanvas] = useState<{ w: number; h: number } | null>(null);
  const [feedCanvas, setFeedCanvas] = useState<{ w: number; h: number } | null>(null);   // the feed card: no button bar below, the action rail's width kept free on the right (Search keeps `canvas`)
  const [placed, setPlaced] = useState<Record<number, string>>({});   // slots the layout placed per outfit (the heart only touches pieces that are visible)
  const layoutInfo = useRef(new Map<number, { layout: string; mode: string }>());
  const [dbg, setDbg] = useState<{ layout?: string[]; debug: boolean; cut: CutMode; acc: boolean; preload: boolean; feed: "default" | "dynamic" | "hybrid" }>({ debug: false, cut: "auto", acc: true, preload: true, feed: "default" });

  // first-visit tutorial (3 steps): two pinned outfits instead of the feed. Nothing from it is recorded: no events, no likes, no taste signals.
  const [obPhase, setObPhase] = useState<"off" | "welcome" | "loading" | "on">("off");   // welcome (gender + styles) comes before the tutorial; its choice is only stored on the device
  const [obItems, setObItems] = useState<FeedOutfit[]>([]);
  const obFetch = useRef<"pending" | "ok" | "fail">("pending"), welcomeOpen = useRef(false), obGender = useRef<Gender | null>(null);   // the tutorial outfits are fetched for the gender chosen on the welcome screen
  const obActive = useRef(false), pendingLoad = useRef(false), loadMoreRef = useRef<() => void>(() => undefined);   // while the tutorial runs, the real feed is not loaded yet (no competing requests / decoding)

  const device = useRef("");
  const scroller = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<FeedOutfit[]>([]);
  const dynRef = useRef(false);
  const hybridRef = useRef(false);   // ?feed=hybrid: starter set, then the composer with this device's taste (held here, in localStorage)
  const outbox = useRef<Signal[]>([]);
  const swapsRef = useRef<SwapState>({});
  const dynState = useRef({ page: 0, startersDone: false, servedStarters: 0, startersSent: false });
  const [swaps, setSwaps] = useState<SwapState>({});          // in-session swap state (reset on reload)
  const [swapEvts, setSwapEvts] = useState<Record<number, SwapEvt>>({});
  const swapBusy = useRef(new Set<string>());
  const swapSeq = useRef(0);
  const cursorRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const genderRef = useRef<Gender>("women");
  const enterAt = useRef(new Map<number, number>());
  const interacted = useRef(new Set<number>());
  const prefetched = useRef(new Set<string>());
  const exhausted = useRef(false);
  const seasonOn = useSeasonDecor();
  const seasons = useMemo(() => items.map((o) => dominantSeason(o.tags)), [items]);   // decoration per outfit (swaps do not change the outfit's tags)
  const shown = useMemo(() => items.map((o) => applySwaps(o, swaps[o.id])), [items, swaps]);   // the outfits as the user sees them after swaps
  itemsRef.current = shown;

  // onboarding: only on the first visit (flag in localStorage) or when forced with ?onboarding=1; any failure just skips it
  useEffect(() => {
    const sp = new URLSearchParams(location.search).get("search"); if (sp === "0") setSearchOn(false); else if (sp === "1") setSearchOn(true);
    setNavReady(true);
    if (new URLSearchParams(location.search).get("onboarding") !== "1" && store.get(ONBOARDING_KEY) === "1") return;
    obActive.current = true; welcomeOpen.current = true; setObPhase("welcome");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const warmFeed = useCallback(() => { obActive.current = false; if (pendingLoad.current) { pendingLoad.current = false; loadMoreRef.current(); } }, []);
  const finishOb = useCallback(() => {
    store.set(ONBOARDING_KEY, "1");
    setObPhase("off"); setObItems([]); warmFeed();
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }));
  }, [warmFeed]);
  const skipOb = useCallback(() => { setObPhase("off"); setObItems([]); warmFeed(); }, [warmFeed]);   // not marked as done: the next visit tries again
  // the tutorial outfits load while the user answers the rest of the welcome screens (men and women have their own two outfits)
  const fetchOb = useCallback((g: Gender) => {
    obGender.current = g; obFetch.current = "pending";
    const done = (items: FeedOutfit[] | null) => {
      if (obGender.current !== g) return;   // the gender was changed meanwhile
      if (items?.length === 2) { setObItems(items); obFetch.current = "ok"; if (!welcomeOpen.current) setObPhase("on"); }
      else { obFetch.current = "fail"; if (!welcomeOpen.current) { setObPhase("off"); warmFeed(); } }
    };
    fetch(`/api/onboarding?gender=${g}`, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : null)).then((j: { items: FeedOutfit[] } | null) => done(j?.items ?? null)).catch(() => done(null));
  }, [warmFeed]);
  const finishWelcome = useCallback((g: Gender, styles: string[]) => {
    welcomeOpen.current = false;
    store.set(STYLES_KEY, JSON.stringify(cleanStyles(styles))); store.set(STYLES_GENDER_KEY, g);
    setGender(g);   // the feed (loaded after the tutorial) starts with this gender
    if (obGender.current !== g) fetchOb(g);
    if (obFetch.current === "ok") setObPhase("on"); else if (obFetch.current === "fail") { setObPhase("off"); warmFeed(); } else setObPhase("loading");
  }, [warmFeed, fetchOb]);

  // debug options: ?layout=A,FB forces templates (3-piece, full-body), ?debug=1 shows boxes + margin zone
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const ic = q.get("icons"); if (ic === "0" || ic === "1") setIconsOn(ic === "1");
    const cu = q.get("customize"); if (cu === "0" || cu === "1") setCustomizeOn(cu === "1");
    const mode = q.get("feed") ?? defaults?.feed ?? "base";   // ?feed=... always wins; without it the default comes from app_settings.feed_default
    hybridRef.current = mode === "hybrid";
    dynRef.current = mode === "dynamic" || hybridRef.current;   // ?feed=base (or an unknown value) = the pool feed
    setDbg({ layout: q.get("layout")?.split(",").filter(Boolean), debug: q.get("debug") === "1", cut: q.get("cut") === "off" ? "off" : "auto", acc: q.get("acc") !== "off", preload: q.get("preload") !== "off", feed: mode === "hybrid" ? "hybrid" : mode === "dynamic" ? "dynamic" : "default" });   // ?feed=dynamic: prototype of the dynamic composer   // ?preload=off: test switch for the alternatives preloading
  }, [defaults?.feed]);

  // canvas size follows the scroller (phones, rotation, desktop)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // the phone's bottom safe area (home indicator) is resolved by the browser; read it through a probe element
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:var(--safe-b,env(safe-area-inset-bottom))";
    (el.parentElement ?? document.body).appendChild(probe);   // inside <main>: it sees --safe-b (0 while the bottom bar covers the safe area)
    const measure = () => setCanvas((p) => { const safe = parseFloat(getComputedStyle(probe).paddingBottom) || 0; const n = canvasSize(el.clientWidth, el.clientHeight, safe); return p && p.w === n.w && p.h === n.h ? p : n; });
      setFeedCanvas((p) => { const safe = parseFloat(getComputedStyle(probe).paddingBottom) || 0; const n = canvasSize(el.clientWidth, el.clientHeight, safe, { barPx: 0, railPx: ACTION_RAIL_WIDTH }); return p && p.w === n.w && p.h === n.h ? p : n; });
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

  // hybrid: every signal also goes to the outbox; the next page request takes the outbox along and the server folds it into the taste
  const signal = useCallback((x: Signal, dir?: Gender | null) => {
    if (!hybridRef.current) return;
    if (dir && dir !== genderRef.current) {   // a like in the other direction (Search): it goes to that direction's own outbox and counts at its next feed page or search
      const k = `drape.outbox.${dir}`;
      try { const ob = JSON.parse(store.get(k) ?? "[]"); store.set(k, JSON.stringify([...(Array.isArray(ob) ? ob : []), { ...x, at: Date.now() }].slice(-OUTBOX_MAX))); } catch { /* ignore */ }
      return;
    }
    outbox.current = [...outbox.current, { ...x, at: Date.now() }].slice(-OUTBOX_MAX);
    store.set(`drape.outbox.${genderRef.current}`, JSON.stringify(outbox.current));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || exhausted.current) return;
    loadingRef.current = true; setLoading(true); setError(false);
    const g = genderRef.current;
    try {
      let data: FeedResponse;
      if (dynRef.current) {
        // dynamic prototype: the fixed starter set first (CDN-cached pages), then pages composed for this device
        let items: FeedOutfit[] = [];
        const tasteN = Number(store.get(`drape.tasteN.${g}`) ?? 0) + outbox.current.length;   // hybrid: from about 20 signals on, skip the rest of the starter set
        if (hybridRef.current && (tasteN >= PERSONALIZE_FROM || pickedStyles(g).length)) dynState.current.startersDone = true;   // picked styles: straight to composed pages, so the picks count from the first card
        if (hasShopPrefs()) dynState.current.startersDone = true;   // Profile > Shops: the fixed starter set is the same for everyone and ignores them, so go straight to composed pages
        if (!dynState.current.startersDone && new URLSearchParams(location.search).get("starter") !== "off") {   // ?starter=off: straight to composed pages (tests)
          const r = await fetch(`/api/dynamic?gender=${g}&starter=${dynState.current.page}`, { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(String(r.status));
          items = ((await r.json()) as { items: FeedOutfit[] }).items;
          if (items.length) { dynState.current.page++; dynState.current.servedStarters += items.length; } else dynState.current.startersDone = true;
        }
        if (!items.length) {
          const recent = itemsRef.current.slice(-12).filter((o) => o.dyn).map((o) => ({ ids: o.dyn!.ids, style: o.dyn!.style, store: o.dyn!.store }));
          const sent = hybridRef.current ? outbox.current.slice(0, OUTBOX_MAX) : [];
          const hyb = hybridRef.current ? { mode: "hybrid", taste: store.get(`drape.taste.${g}`) ?? "", signals: sent, ...(pickedStyles(g).length ? { seed: pickedStyles(g) } : {}) } : {};   // the welcome picks are a starting prior; the server fades it out as real events come in
          const r = await fetch("/api/dynamic", { method: "POST", signal: AbortSignal.timeout(20000), body: JSON.stringify({ ...hyb, device_id: device.current, gender: g, recent, contrast: Number(new URLSearchParams(location.search).get("contrast")) || undefined, shops: shopPrefParam() || undefined, brand: new URLSearchParams(location.search).get("brand") === "0" ? 0 : undefined, ban: new URLSearchParams(location.search).get("ban") === "db" ? "db" : (store.get(`drape.ban.${g}`) ?? ""), startersServed: dynState.current.startersSent ? 0 : dynState.current.servedStarters }) });
          if (!r.ok) throw new Error(String(r.status));
          dynState.current.startersSent = true;
          const j = (await r.json()) as { items: FeedOutfit[]; ban?: string };
          items = j.items; if (j.ban !== undefined) store.set(`drape.ban.${g}`, j.ban);   // the ban list lives on the device (about 4 KB)
          const tj = (j as { taste?: { taste: string; n: number } }).taste;
          if (tj?.taste) {   // the taste lives on the device too (a few KB); the signals that went into it leave the outbox
            store.set(`drape.taste.${g}`, tj.taste); store.set(`drape.tasteN.${g}`, String(tj.n));
            outbox.current = outbox.current.slice(sent.length); store.set(`drape.outbox.${g}`, JSON.stringify(outbox.current));
          }
        }
        data = { items, next_cursor: 1, size: 1 };
      } else {
      const q = new URLSearchParams({ gender: g });
      if (cursorRef.current !== null) q.set("cursor", String(cursorRef.current)); else q.set("device", device.current); // pages with a cursor are shared + CDN-cached
      { const ar = new URLSearchParams(location.search).get("accrev"); if (ar) q.set("accrev", ar); }   // ?accrev=2: women's accessory set revision 2 (preview)
      let res = await fetch(`/api/feed?${q}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!res || !res.ok) res = await fetch(`/api/feed?${q}`, { signal: AbortSignal.timeout(10000) }); // one automatic retry
      if (!res.ok) throw new Error(String(res.status));
      data = (await res.json()) as FeedResponse;
      }
      if (g !== genderRef.current) return; // gender changed while loading
      cursorRef.current = data.next_cursor;
      store.set(`drape.cursor.${g}`, String(data.next_cursor));
      if (!data.items.length && data.size === 0) exhausted.current = true;
      setItems((prev) => { const seen = new Set(prev.map((o) => o.id)); return [...prev, ...data.items.filter((o) => !seen.has(o.id))]; });
    } catch { setError(true); }
    finally { loadingRef.current = false; setLoading(false); }
  }, []);

  loadMoreRef.current = loadMore;

  // (re)start the feed whenever the gender changes
  useEffect(() => {
    if (!gender) return;
    genderRef.current = gender;
    store.set("drape.gender", gender);
    const saved = store.get(`drape.cursor.${gender}`);
    cursorRef.current = saved !== null && /^\d+$/.test(saved) ? Number(saved) : null;
    try { const ob = JSON.parse(store.get(`drape.outbox.${gender}`) ?? "[]"); outbox.current = Array.isArray(ob) ? ob.slice(-OUTBOX_MAX) : []; } catch { outbox.current = []; }
    exhausted.current = false; enterAt.current.clear(); interacted.current.clear(); dynState.current = { page: 0, startersDone: false, servedStarters: 0, startersSent: false };
    setItems([]); setCurrent(0);
    scroller.current?.scrollTo({ top: 0 });
    loadingRef.current = false;
    if (obActive.current) pendingLoad.current = true; else loadMore();
  }, [gender, loadMore]);

  // the action rail is a fixed overlay: only its state follows the outfit that is in view (passive scroll listener, one frame at a time)
  useEffect(() => {
    const el = scroller.current;
    if (!el || obPhase !== "off") return;
    let raf = 0;
    const sync = () => { raf = 0; const sec = el.querySelector("section[data-i]") as HTMLElement | null; if (sec) setRailIdx(railIndex(el.scrollTop, sec.offsetHeight, itemsRef.current.length)); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sync); };
    el.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [obPhase, items.length]);

  // impressions, dwell time, scroll-past (IntersectionObserver on each outfit screen)
  useEffect(() => {
    const root = scroller.current;
    if (!root || !items.length || obPhase !== "off") return;
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
          track({ event_type: "dwell_ms", outfit_id: o.id, product_ids: ids, feed_index: i, gender: genderRef.current, dwell_ms: dwell, ...(o.tags ? { ctx: { tags: compactTags(o.tags) } } : {}) });
          signal({ t: "dwell_ms", o: ids, d: dwell, tg: tg(o) });
          // swapped pieces that are on screen when the user leaves the outfit count as kept (stronger after a like / tap / long look)
          const sw = swapsRef.current[o.id];
          if (sw) for (const key of Object.keys(sw)) { const c = key === "top" ? o.top : key === "bottom" ? o.bottom : key === "shoes" ? o.shoes : null; if (c) signal({ t: "keep", p: c.id, o: ids, b: interacted.current.has(i) && dwell >= 8000 ? 2 : 1 }); }
          if (dwell < 1000 && !interacted.current.has(i)) { track({ event_type: "scroll_past", outfit_id: o.id, product_ids: ids, feed_index: i, gender: genderRef.current }); signal({ t: "scroll_past", o: ids, tg: tg(o) }); }
        }
      }
    }, { root, threshold: [0, 0.3, 0.6] });
    root.querySelectorAll("section[data-i]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [items.length, obPhase]);

  // prefetch the next 3 outfits' images; load more when close to the end
  useEffect(() => {
    for (let k = 1; k <= 3; k++) {
      const o = items[current + k];
      if (!o) continue;
      const list: [FeedCard | null | undefined, "top" | "bottom" | "shoes" | "full"][] = [[o.top, o.kind === "full" ? "full" : "top"], [o.bottom, "bottom"], [o.shoes, "shoes"], ...(o.accessories ?? []).map((a) => [a.card, "top"] as [FeedCard, "top"])];
      for (const [c, slot] of list) {
        if (!c) continue;
        const u = feedSrc(viewCard(c, dbg.cut), pieceClass(slot, c));
        if (!prefetched.current.has(u)) { prefetched.current.add(u); const img = new Image(); img.referrerPolicy = "no-referrer"; img.src = u; }
      }
    }
    if (items.length && current >= items.length - 4) loadMore();
  }, [current, items, loadMore, dbg.cut]);

  const likeResult = useRef(false);   // new like state of the last toggleLike (the double-tap pulse reads it)
  const toggleLike = useCallback((card: FeedCard, outfit: FeedOutfit | null, index: number, slot: SlotName | "sheet") => {
    const want = !liked.has(card.id);
    likeResult.current = want;
    setLiked((prev) => { const n = new Set(prev); if (want) n.add(card.id); else n.delete(card.id); return n; });
    if (outfit && tabRef.current === "foryou") interacted.current.add(index);   // a like from the Search tab counts as a normal like, but is not a feed interaction
    const og = outfit?.og;   // Search in the other direction than the feed's: the like counts for THAT direction's taste, from the product alone (the rest of such an outfit is arbitrary)
    const ls = likeSignal(want, card.id, outfit ? { ids: shownIds(outfit), tg: tg(outfit), og } : null);
    signal(ls.signal, ls.dir);
    fetch("/api/likes", {
      method: "POST",
      body: JSON.stringify({ device_id: device.current, product_id: card.id, liked: want, outfit_id: outfit?.id, feed_index: index, slot: slot === "sheet" ? "sheet" : slot, gender: og ?? genderRef.current, tags: !og && outfit?.tags ? compactTags(outfit.tags) : undefined, product_ids: !og && outfit ? shownIds(outfit) : undefined }),
    }).then((r) => { if (!r.ok) throw new Error(); }).catch(() => {
      setLiked((prev) => { const n = new Set(prev); if (want) n.delete(card.id); else n.add(card.id); return n; }); // revert
    });
  }, [liked]);

  // Heart on the action rail: likes (or unlikes) every visible piece of the outfit, each through the normal per-piece like path (same rows, outfit context and taste signal).
  // All liked -> unlike all; otherwise like the missing ones. No new event type: the per-piece like rows are the events.
  const heartOutfit = (o: FeedOutfit, index: number) => {
    const cards = outfitPieces(o, placed[o.id]?.split(","));
    const { ids } = heartToggle(cards.map((c) => c.id), liked);
    for (const c of cards) if (ids.includes(c.id)) toggleLike(c, o, index, "sheet");
  };

  // Swipe on a piece: swap only that piece, in a loop of three (original -> alternative 1 -> alternative 2 -> original ...).
  // Swipe right = next, left = previous. The alternatives come with the feed page (no request on swipe), their images are preloaded when idle.
  const swapPiece = (o: FeedOutfit, index: number, slot: SlotName, dir: "next" | "prev") => {
    const key = slotKeyOf(slot), n = loopSize(o, key);
    if (n < 2) return;                                   // nothing to swap with
    const lk = `${o.id}:${key}`;
    if (swapBusy.current.has(lk)) return;
    swapBusy.current.add(lk); setTimeout(() => swapBusy.current.delete(lk), 330);
    const cur = swaps[o.id]?.[key] ?? 0, nxt = (cur + (dir === "next" ? 1 : n - 1)) % n;
    const accNo = key.startsWith("acc") ? Number(key.slice(3)) : 0;
    const pieceAt = (pos: number): FeedCard => {
      const alt = pos > 0 ? o.alts![key][pos - 1].card : null;
      if (alt) return alt;
      return key === "top" ? o.top : key === "bottom" ? o.bottom! : key === "shoes" ? o.shoes : o.accessories!.find((a, i) => (a.slot_no ?? i + 1) === accNo)!.card;
    };
    const out = pieceAt(cur), incoming = pieceAt(nxt);
    const seq = ++swapSeq.current;
    setSwaps((p) => { const n = { ...p, [o.id]: { ...(p[o.id] ?? {}), [key]: nxt } }; swapsRef.current = n; return n; });
    setSwapEvts((p) => ({ ...p, [o.id]: { slot, dir: dir === "next" ? "prev" : "next", seq, kind: "swap", newId: incoming.id } }));   // swipe right: the content moves right
    interacted.current.add(index);
    signal({ t: "swap", x: out.id, i: incoming.id, a: nxt, f: cur, o: shownIds(itemsRef.current[index] ?? o) });
    track({ event_type: "swap", outfit_id: o.id, feed_index: index, slot: trackSlot(slot), product_id: incoming.id, gender: genderRef.current, ctx: { out: out.id, dir, rank: nxt, alt: nxt, from: cur, ...(o.tags ? { tags: compactTags(o.tags) } : {}) } });
  };

  // Preload the alternatives' images once the outfit is fully shown: idle time, low priority, cancelled when the user scrolls on,
  // skipped with data saver / 2g. Order (data budget): 1) the visible outfit's top / bottom / shoes alternatives, 2) its accessory
  // alternatives, 3) the NEXT outfit's first alternative per main piece.
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || /2g/.test(conn?.effectiveType ?? "") || !dbg.preload || !shown.length) return;
    let cancelled = false; const inflight: HTMLImageElement[] = [];
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? (window as unknown as { requestIdleCallback: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
    const urls = (o: FeedOutfit | undefined, keys: (k: string) => boolean, maxAlts: number) => {
      const out: string[] = [];
      for (const [key, list] of Object.entries(o?.alts ?? {})) {
        if (!keys(key)) continue;
        for (const a of list.slice(0, maxAlts)) {
          const cls = key === "top" && o!.kind === "full" ? "full" : key.startsWith("acc") ? "top" : (key as "top" | "bottom" | "shoes");
          out.push(feedSrc(viewCard(a.card, dbg.cut), pieceClass(cls, a.card)));
        }
      }
      return out;
    };
    const main = (k: string) => !k.startsWith("acc"), acc = (k: string) => k.startsWith("acc");
    const queue = [...urls(shown[current], main, 2), ...urls(shown[current], acc, 2), ...urls(shown[current + 1], main, 1)].filter((u) => !prefetched.current.has(u));
    const run = async () => {
      for (const u of queue) {
        if (cancelled) return;
        await new Promise<void>((res) => idle(() => {
          if (cancelled) return res();
          prefetched.current.add(u);
          const img = new Image(); img.referrerPolicy = "no-referrer"; img.decoding = "async"; (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "low";
          img.onload = img.onerror = () => res(); inflight.push(img); img.src = u;
        }));
      }
    };
    const t = setTimeout(run, 700);   // the outfit counts as "fully shown" after a short pause
    return () => { cancelled = true; clearTimeout(t); for (const i of inflight) if (!i.complete) i.src = ""; };
  }, [current, shown.length, dbg.cut, dbg.preload]); // eslint-disable-line react-hooks/exhaustive-deps

  const navOn = navVisible(navReady, obPhase === "off");   // the bar is hidden during the welcome flow and the tutorial; with search off it shows For You + Wishlist
  const H = "calc(100dvh - var(--nav-h, 0px))";
  const goTab = useCallback((t: Tab) => {
    if (t === "search" && tabRef.current === "search") { setSearchTap((n) => n + 1); return; }   // Search tapped again: Search switches between results and configurator, no tab switch (nothing recorded)
    if (t === "search" || t === "likes" || t === "profile") {
      if (!awayAt.current) awayAt.current = Date.now();
      if (t === "search") { setSearchSeen(true); if (!searchStarted.current) { searchStarted.current = true; track({ event_type: "search_started", gender: genderRef.current }); } }
    } else if (awayAt.current) { const gone = Date.now() - awayAt.current; awayAt.current = 0; for (const [k, v] of enterAt.current) enterAt.current.set(k, v + gone); }   // time spent on the Search tab is not dwell time
    tabRef.current = t; setTab(t);
  }, []);
  useEffect(() => { if (!navOn && tabRef.current !== "foryou") goTab("foryou"); }, [navOn, goTab]);
  const openFromSearch = useCallback((card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => setSheet({ card, outfit, index, slot }), []);   // no tap event: Search only shares the like path with the feed
  const likeFromCard = useCallback((card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => { toggleLike(card, outfit, index, slot); return likeResult.current; }, [toggleLike]);
  const backToForYou = useCallback(() => goTab("foryou"), [goTab]);
  const layers = tabLayers(tab, searchSeen);   // panels crossfade (Layer); visibility keeps the scroll position, nothing re-renders
  const obHeader = obPhase !== "off";   // header controls rest during the tutorial
  const open = (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => {
    interacted.current.add(index);
    signal({ t: "tap_product", p: card.id, o: shownIds(outfit), tg: tg(outfit) });
    track({ event_type: "tap_product", product_id: card.id, outfit_id: outfit.id, feed_index: index, slot: trackSlot(slot), gender: genderRef.current, ...(outfit.tags ? { ctx: { tags: compactTags(outfit.tags) } } : {}) });
    setSheet({ card, outfit, index, slot });
  };

  return (
    <MotionRoot>
    <main className="h-dvh bg-white" style={{ "--nav-h": navOn ? `calc(${NAV_PX}px + env(safe-area-inset-bottom))` : "0px", "--safe-b": navOn ? "0px" : "env(safe-area-inset-bottom)" } as React.CSSProperties}>
      <SaleInkDefs />
      <Layer active={layers.feedActive} shiftPx={0}>
        {seasonOn && obPhase === "off" && <SeasonDecor scroller={scroller} seasons={seasons} className="fixed inset-x-0 top-0" style={DECOR_BOX} sunFront />}
        <header className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-white/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
          <span className="w-16 text-lg font-semibold tracking-tight">Drape</span>
          <Segmented id="gender" label="Section" disabled={obHeader} value={gender as Gender} onChange={setGender} options={[{ id: "women", label: "Women" }, { id: "men", label: "Men" }]} />
          <span className="w-16" aria-hidden />
        </header>

        <div ref={scroller} className="no-scrollbar snap-y snap-mandatory overflow-y-scroll overscroll-y-contain" style={{ height: H }}>
          {obPhase === "off" && shown.map((o, i) => (
            <section key={o.id} data-i={i} className="relative flex snap-start snap-always flex-col items-center justify-center pt-[3.75rem]" style={{ height: H, paddingBottom: "var(--safe-b)" }}>
              {feedCanvas && (
                <div className="relative" style={{ width: feedCanvas.w + ACTION_RAIL_WIDTH, height: feedCanvas.h }}>   {/* the right ACTION_RAIL_WIDTH px stay empty: the fixed rail overlay sits there */}
                  <OutfitCanvas outfit={o} canvas={feedCanvas} override={dbg.layout} debug={dbg.debug} cut={dbg.cut} showAcc={dbg.acc} reserveIcons={iconsOn} priority={i < 2} onOpen={(c, slot) => open(c, o, i, slot)} onLike={(c, slot) => { if (feedDoubleTap(liked.has(c.id)) === "replay") return true; toggleLike(c, o, i, slot); return likeResult.current; }} swapEvt={swapEvts[o.id]} onSwipe={(slot, dir) => swapPiece(items[i], i, slot, dir)}
                    onLayout={(layout, mode, slots) => { layoutInfo.current.set(o.id, { layout, mode }); const k = slots.join(","); setPlaced((p) => (p[o.id] === k ? p : { ...p, [o.id]: k })); }} />
                </div>
              )}
              {iconsOn && <OutfitIcons icons={outfitIcons(o.tags)} outfitKey={o.id} />}
            </section>
          ))}
          {obPhase === "loading" && <section style={{ height: H }} className="flex items-center justify-center text-sm text-neutral-400">Loading…</section>}
          {obPhase === "off" && !items.length && (
            <section style={{ height: H }} className="flex items-center justify-center text-sm text-neutral-400">
              {error ? <button onClick={() => loadMore()} className="rounded-full border border-neutral-300 px-4 py-2 text-neutral-700">Try again</button> : loading || !gender ? "Loading…" : "No outfits yet."}
            </section>
          )}
        </div>

        {obPhase === "off" && feedCanvas && shown[railIdx] && (   // fixed action rail: never moves with the cards; acts on the outfit in view
          <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col items-center justify-center pt-[3.75rem]" style={{ height: H, paddingBottom: "var(--safe-b)" }}>
            <div className="relative" style={{ width: feedCanvas.w + ACTION_RAIL_WIDTH, height: feedCanvas.h }}>
              <ActionRail actions={[heartAction(heartState(outfitPieces(shown[railIdx], placed[shown[railIdx].id]?.split(",")).map((c) => c.id), liked) === "all", () => heartOutfit(shown[railIdx], railIdx))]} />
            </div>
          </div>
        )}

      </Layer>

      {navOn && searchOn && layers.searchMounted && (
        <Layer active={layers.searchActive} appear className="fixed inset-x-0 top-0 z-30" style={{ bottom: "var(--nav-h)" }}>
          <Search key={gender ?? "women"} gender={gender ?? "women"} tapKey={searchTap} canvas={canvas} onOpen={openFromSearch} onLike={likeFromCard} onBack={backToForYou} />
        </Layer>
      )}
      <AnimatePresence>
        {navOn && layers.wishlistOpen && (
          <WishlistView key="wishlist" icons={iconsOn} customize={customizeOn} gender={gender ?? "women"} liked={liked} tab={wishTab} onTab={setWishTab} onOpen={openFromSearch} onLike={likeFromCard}
            onToggle={(card) => toggleLike(card, null, 0, "sheet")}
            onOpenProduct={(card) => setSheet({ card, outfit: null, index: 0, slot: "top" })} sheetOpen={!!sheet} />
        )}
      </AnimatePresence>
      <AnimatePresence>{navOn && layers.profileOpen && <ProfileView key="profile" />}</AnimatePresence>
      {navOn && <BottomNav tab={tab} onTab={goTab} searchOn={searchOn} />}

      {obPhase === "welcome" && <Welcome onDone={finishWelcome} onGender={fetchOb} />}
      {obPhase === "on" && feedCanvas && <TutorialFeed items={obItems} canvas={feedCanvas} onFinish={finishOb} onSkip={skipOb} onWarm={warmFeed} />}

      {dbg.debug && (
        <button onClick={() => setDbg((d) => ({ ...d, cut: d.cut === "auto" ? "off" : "auto" }))}
          className="fixed bottom-3 left-3 z-50 rounded bg-black px-2 py-1 text-xs text-white">cutouts: {dbg.cut === "auto" ? "on" : "off (originals)"}</button>
      )}

      <AnimatePresence>
        {sheet && (
          <ProductSheet key="sheet" card={sheet.card} feedVariant={dbg.feed === "default" ? "base" : dbg.feed} liked={liked.has(sheet.card.id)} onClose={() => setSheet(null)}
          onLike={() => toggleLike(sheet.card, sheet.outfit, sheet.index, "sheet")}
          onViewProduct={() => (sheet.outfit && signal({ t: "view_product_click", p: sheet.card.id, o: shownIds(sheet.outfit) }), track({ event_type: "view_product_click", product_id: sheet.card.id, outfit_id: sheet.outfit?.id, feed_index: sheet.index, slot: "sheet", gender: genderRef.current }))} />
      )}
      </AnimatePresence>
    </main>
    </MotionRoot>
  );
}
