"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import { ACTION_RAIL_WIDTH } from "@/config/action-rail";
import { feedSrc, viewCard } from "@/lib/client/format";
import { applySwaps, type SwapEvt } from "@/lib/client/swap";
import { saleMarkerOn } from "@/lib/client/sale";
import type { SlotName } from "@/lib/layout/engine";
import OutfitCanvas from "./OutfitCanvas";
import OnboardingOverlay, { HeartDemo, OB_LAST, type ObRects, type ObStep } from "./Onboarding";

/**
 * The first-visit tutorial as its own component: its gestures (swap, scroll, steps) only re-render THIS tree, never the feed.
 * Nothing is recorded (no events, likes or taste signals). Everything it shows is loaded AND decoded before the first frame:
 * a neutral "Loading…" until then, no half-loaded outfits. If that fails or takes too long, the tutorial is skipped (onSkip).
 */
const noop = () => { /* no product sheet in the tutorial */ };
const READY_TIMEOUT_MS = 10_000;
const urlOf = (c: FeedCard) => feedSrc(viewCard(c, "auto"), "top");   // tutorial pieces are cutouts: the url does not depend on the class

const Section = memo(function Section({ o, tag, canvas, onSwipe, swapEvt }: { o: FeedOutfit; tag: "A" | "B"; canvas: { w: number; h: number }; onSwipe?: (slot: SlotName, dir: "next" | "prev") => void; swapEvt?: SwapEvt }) {
  return (
    <section data-ob={tag} className="relative flex h-dvh snap-start snap-always flex-col items-center justify-center pt-[3.75rem]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative" style={{ width: canvas.w + ACTION_RAIL_WIDTH, height: canvas.h }}>   {/* same card as the feed: the rail's width stays free on the right */}
        <OutfitCanvas outfit={o} canvas={canvas} showAcc priority animateLayout={false} onOpen={noop} swapEvt={swapEvt} onSwipe={onSwipe} />
      </div>
    </section>
  );
});

export default function TutorialFeed({ items, canvas, onFinish, onSkip, onWarm }: { items: FeedOutfit[]; canvas: { w: number; h: number }; onFinish: () => void; onSkip: () => void; onWarm: () => void }) {
  const [A, B] = items;
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<ObStep>(1);
  const [pos, setPos] = useState(0);                              // top piece of B: 0 = original, 1 / 2 = alternatives
  const [evt, setEvt] = useState<SwapEvt | undefined>();
  const [rects, setRects] = useState<ObRects>({ top: null, sale: null, heart: null, vw: 390, vh: 800 });
  const root = useRef<HTMLDivElement>(null), held = useRef<HTMLImageElement[]>([]);
  const stepRef = useRef(step), posRef = useRef(0), busyUntil = useRef(0), seq = useRef(0), doneRef = useRef(false);
  stepRef.current = step;
  const loop = (B.alts?.top?.length ?? 0) + 1;

  // 1) load + decode every image the tutorial shows (both outfits, accessories, the top alternatives), then wait for fonts: only then show step 1
  useEffect(() => {
    let dead = false;
    const cards = (o: FeedOutfit) => [o.top, o.bottom, o.shoes, ...(o.accessories ?? []).map((a) => a.card), ...(o.alts?.top ?? []).map((a) => a.card)].filter((c): c is FeedCard => !!c);
    const urls = [...new Set(items.flatMap(cards).map(urlOf))];
    const load = (u: string) => new Promise<boolean>((res) => {
      const img = new Image(); img.referrerPolicy = "no-referrer"; held.current.push(img);   // kept alive so the decoded bitmaps stay cached
      img.src = u;
      (img.decode ? img.decode() : new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(); })).then(() => res(true), () => res(false));
    });
    const timer = setTimeout(() => { if (!doneRef.current) { doneRef.current = true; onSkip(); } }, READY_TIMEOUT_MS);
    (async () => {
      const ok = await Promise.all(urls.map(load));
      if (dead) return;
      if (ok.includes(false)) { if (!doneRef.current) { doneRef.current = true; onSkip(); } return; }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // the (hidden) sections have their final layout
      await Promise.all([...(root.current?.querySelectorAll("img") ?? [])].map((i) => i.decode().catch(() => undefined)));   // the images actually on screen
      await document.fonts.ready.catch(() => undefined);                                  // SALE label font
      if (dead || doneRef.current) return;
      doneRef.current = true; clearTimeout(timer); setReady(true);
    })();
    return () => { dead = true; clearTimeout(timer); };
  }, [items, onSkip]);

  // 2) measure the pieces the arrows point at: once per step / swap (after the swap animation), never polled
  const measure = useCallback(() => {
    const sec = root.current?.querySelector('section[data-ob="B"]');
    const rect = (el: Element | null | undefined): ObRects["top"] => { const b = el?.getBoundingClientRect(); return b && b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
    const label = sec?.querySelector('[data-slot="shoes"] [data-sale-label]') ?? sec?.querySelector("[data-sale-label]") ?? null;
    setRects({ top: rect(sec?.querySelector('[data-slot="top"]')), sale: rect(label), heart: rect(root.current?.parentElement?.querySelector("[data-ob-heart]") ?? null), vw: innerWidth, vh: innerHeight });
    return !!label;
  }, []);
  useEffect(() => {
    if (!ready || step < 2) return;
    const t1 = setTimeout(measure, 50);
    const t2 = setTimeout(() => { const hasLabel = measure(); if (stepRef.current === 3 && !hasLabel) setStep(4); }, 450);   // step 3 needs a visible sale label; if none shows, it is skipped
    const onResize = () => measure();
    addEventListener("resize", onResize);
    return () => { clearTimeout(t1); clearTimeout(t2); removeEventListener("resize", onResize); };
  }, [ready, step, pos, measure, onFinish]);
  useEffect(() => { if (step < 3) return; const t = setTimeout(onWarm, 2500); return () => clearTimeout(t); }, [step, onWarm]);   // the real feed starts loading once the user has been on a late, idle step for a moment (never during the swap animation); finishing also starts it

  // 3) gestures
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (stepRef.current === 1 && el.scrollTop >= el.clientHeight * 0.9) setStep(2);   // step 1 done: the user really scrolled to the next outfit
  }, []);
  const swapTop = useCallback((slot: SlotName, dir: "next" | "prev") => {
    if (slot !== "top" || Date.now() < busyUntil.current) return;      // only the top piece swaps
    busyUntil.current = Date.now() + 330;
    const cur = posRef.current, nxt = (cur + (dir === "next" ? 1 : loop - 1)) % loop;
    posRef.current = nxt; setPos(nxt);
    setEvt({ slot: "top", dir: dir === "next" ? "prev" : "next", seq: ++seq.current, kind: "swap", newId: nxt > 0 ? B.alts!.top[nxt - 1].card.id : B.top.id });
    if (stepRef.current === 2) { setStep(saleMarkerOn() ? 3 : 4); }   // step 2 done: the user really swapped the top piece
  }, [B, loop]);

  const next = useCallback(() => { if (stepRef.current >= OB_LAST) onFinish(); else setStep((s) => (s + 1) as ObStep); }, [onFinish]);   // steps 3-6 are tapped through
  const shownB = useMemo(() => applySwaps(B, { top: pos }), [B, pos]);
  return (
    <div className="fixed inset-x-0 top-0 z-20 h-dvh bg-white">
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Loading…</div>}
      <div ref={root} onScroll={onScroll} className={`no-scrollbar h-dvh snap-y snap-mandatory overscroll-y-contain ${step >= 2 ? "overflow-y-hidden" : "overflow-y-scroll"}`}
        style={{ opacity: ready ? 1 : 0, visibility: ready ? "visible" : "hidden", transition: "opacity .25s ease-out" }}>
        <Section o={A} tag="A" canvas={canvas} />
        <Section o={shownB} tag="B" canvas={canvas} onSwipe={swapTop} swapEvt={evt} />
      </div>
      {ready && step === 4 && <HeartDemo canvas={canvas} />}
      {ready && <OnboardingOverlay step={step} rects={rects} onNext={next} />}
    </div>
  );
}
