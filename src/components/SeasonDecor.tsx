"use client";
import { viewHeight } from "@/lib/view-height";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { SEASON_DECOR as C, DECOR_ART, DECOR_OVERSCAN_PX, LAYER_Z } from "@/config/season-decor";
import { artClip, artLayerStyle, decorClip, decorWindow, parseDecorMode, type DecorSeason, type DecorStage } from "@/lib/season-decor";
import DecorDebug from "./DecorDebug";
import Mannequin from "./Mannequin";
import type { MannequinSpec } from "@/lib/mannequin";
import { DECO_BITMAP_SIZE, decoPx, leafMarkup, meadowMarkup, snap, snowMarkup, spotPieces, sunMarkup, sunPx } from "@/lib/season-decor-art";

// Screen-anchored seasonal decoration. One layer sits over the scroll area; for the (at most 3) outfits near the viewport it holds that outfit's decoration,
// clipped to the part of the screen where THAT outfit is visible. The decorations never move; only the clip windows follow the scroll offset, written
// straight to the DOM from the scroll event (no React render per frame). Behind the outfits, pointer-events none.
const grid = { shapeRendering: "crispEdges" } as const;

function Sun({ safeTop }: { safeTop: boolean }) {
  const html = useMemo(() => sunMarkup(), []), size = DECO_BITMAP_SIZE * sunPx();
  return <svg className="absolute right-0" style={{ top: safeTop ? `calc(env(safe-area-inset-top, 0px) + ${C.sun.topOffsetPx}px)` : C.sun.topOffsetPx }} width={size} height={size} viewBox={`0 0 ${DECO_BITMAP_SIZE} ${DECO_BITMAP_SIZE}`} {...grid} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Meadow({ width }: { width: number }) {
  const a = useMemo(() => meadowMarkup(width), [width]);
  if (!(width > 0)) return null;
  return <svg className="absolute left-0" style={{ bottom: "var(--safe-b, 0px)" }} width={width} height={a.rows * decoPx()} viewBox={`0 0 ${a.cols} ${a.rows}`} preserveAspectRatio="none" {...grid} dangerouslySetInnerHTML={{ __html: a.html }} />;
}

/** two fixed spots of static pixel pieces, positions snapped to the decoration pixel grid */
function Spots({ kind, width, height }: { kind: "autumn" | "winter"; width: number; height: number }) {
  const html = useMemo(() => (kind === "autumn" ? leafMarkup() : snowMarkup()), [kind]), px = decoPx(), size = DECO_BITMAP_SIZE * px * (kind === "autumn" ? C.leaves.scale : C.snow.scale);
  const pieces = useMemo(() => C.spots.places.map((pl, i) => spotPieces(i, width).map((p) => ({ key: p.seed, left: snap(pl.x * width + p.dx), top: snap((pl.y0 + p.yFrac * (pl.y1 - pl.y0)) * height) }))), [width, height]);
  if (!(width > 0 && height > 0)) return null;
  return (
    <>
      {pieces.flat().map((p) => <svg key={p.key} className="absolute" style={{ left: p.left, top: p.top }} width={size} height={size} viewBox={`0 0 ${DECO_BITMAP_SIZE} ${DECO_BITMAP_SIZE}`} {...grid} dangerouslySetInnerHTML={{ __html: html }} />)}
    </>
  );
}

/** painted illustrations (default): plain img layers, absolute inside the group, so no layout shift; all sprites are preloaded once. */
const ART_SRCS = Object.values(DECOR_ART).flat().map((l) => l.src);
function ArtLayers({ season, stage }: { season: DecorSeason; stage: DecorStage }) {
  return <>{DECOR_ART[season].map((l) => { const st = artLayerStyle(l, stage); return st && /* eslint-disable-next-line @next/next/no-img-element */ <img key={l.src} src={l.src} alt="" decoding="async" draggable={false} style={{ ...st, objectFit: "fill" }} />; })}</>;
}

const Art = ({ season, width, height, sun, safeTop }: { season: DecorSeason; width: number; height: number; sun: boolean; safeTop: boolean }) =>
  season === "summer" ? (sun ? <Sun safeTop={safeTop} /> : null) : season === "spring" ? <Meadow width={width} /> : <Spots kind={season} width={width} height={height} />;

/** `scroller` = the snap scroller the outfits live in (offset and height are read from it); `seasons[i]` = decoration of outfit i (null = none).
 *  `minis` = outfit preview figures (same clipping, drawn in front of the season art and still behind the products): `specs[i]` is outfit i's figure, `searchOn` places it over the Profile tab.
 *  `className`/`style` give the figure/pixel layer its box (same box as the scroller). ART mode (default) is a separate layer `artClassName`/`artStyle` = the whole screen (feed: fixed inset-0, like the stripe background), clipped only by the screen edge. `sunFront`: the layer starts under the status/safe area (feed), so the sun is offset by it. Everything sits behind the products (no z-index). */
function SeasonDecor({ scroller, seasons, minis, className, style, sunFront, artClassName, artStyle, stageBars }: { scroller: RefObject<HTMLElement | null>; seasons: (DecorSeason | null)[] | null; minis?: { specs: MannequinSpec[]; searchOn: boolean } | null; className: string; style?: CSSProperties; sunFront?: boolean; artClassName?: string; artStyle?: CSSProperties; stageBars?: boolean }) {
  const root = useRef<HTMLDivElement>(null), artBox = useRef<HTMLDivElement>(null), geo = useRef({ off: 0, layerH: 0 });
  const [win, setWin] = useState<number[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [artSize, setArtSize] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState<DecorStage | null>(null);   // stageBars: the stage in viewport coordinates (header bottom .. tab bar top)
  const [cur, setCur] = useState(0);   // nearest outfit index (only tracked for ?decordebug=1)
  const debug = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("decordebug") === "1", []);
  const mode = useMemo(() => (typeof window === "undefined" ? "art" : parseDecorMode(new URLSearchParams(window.location.search).get("decor"))), []);
  useEffect(() => { if (mode === "art") ART_SRCS.forEach((src) => { const im = new Image(); im.decoding = "async"; im.src = src; }); }, [mode]);
  const winKey = useRef(""), count = Math.max(seasons?.length ?? 0, minis?.specs.length ?? 0);

  const apply = () => {   // clip every group to where its outfit is on screen (direct DOM writes)
    const sc = scroller.current, el = root.current; if (!sc || !el) return;
    const h = viewHeight(sc), st = sc.scrollTop;
    el.querySelectorAll<HTMLElement>(".sd-art").forEach((g) => {
      const c = artClip(Number(g.dataset.i), st, h, geo.current.off, geo.current.layerH);
      g.style.clipPath = c ? `inset(${c.top}px 0px ${c.bottom}px 0px)` : "";
      g.style.visibility = c ? "" : "hidden";
    });
    el.querySelectorAll<HTMLElement>(".sd-group").forEach((g) => {
      const c = decorClip(Number(g.dataset.i), st, h);
      g.style.clipPath = c ? `inset(${c.top}px 0px ${c.bottom}px 0px)` : "";
      g.style.visibility = c ? "" : "hidden";
    });
  };
  const measure = () => {   // where the scroller sits inside the full-screen art layer (only on resize, never per scroll frame)
    const sc = scroller.current, box = artBox.current; if (!sc || !box) return;
    if (stageBars) {   // stage = from the header's bottom edge to the tab bar's top edge, full screen width
      const t = document.querySelector("[data-stage-top]"), b = document.querySelector("[data-stage-bottom]");
      const y0 = t ? t.getBoundingClientRect().bottom : 0, y1 = b ? b.getBoundingClientRect().top : window.innerHeight, w = document.documentElement.clientWidth;
      setStage((p) => (p && p.y === y0 && p.h === y1 - y0 && p.w === w ? p : { x: 0, y: y0, w, h: y1 - y0 }));
    }
    geo.current = { off: sc.getBoundingClientRect().top - box.getBoundingClientRect().top, layerH: box.clientHeight };
    setArtSize((p) => (p.w === box.clientWidth && p.h === box.clientHeight ? p : { w: box.clientWidth, h: box.clientHeight }));
  };
  const sync = () => {
    const sc = scroller.current; if (!sc) return;
    const w = decorWindow(sc.scrollTop, viewHeight(sc), count), k = w.join(",");
    if (k !== winKey.current) { winKey.current = k; setWin(w); }
    if (debug) setCur(Math.max(0, Math.round(sc.scrollTop / Math.max(1, viewHeight(sc)))));
    setSize((p) => (p.w === sc.clientWidth && p.h === viewHeight(sc) ? p : { w: sc.clientWidth, h: viewHeight(sc) }));
    apply();
  };
  const syncRef = useRef(sync); syncRef.current = sync;
  const measureRef = useRef(measure); measureRef.current = measure;

  useEffect(() => {
    const sc = scroller.current; if (!sc) return;
    const on = () => syncRef.current(), onSize = () => { measureRef.current(); on(); };
    sc.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(onSize); ro.observe(sc); if (artBox.current) ro.observe(artBox.current);
    if (stageBars) document.querySelectorAll("[data-stage-top],[data-stage-bottom]").forEach((e) => ro.observe(e));   // bars changing height move the stage
    window.addEventListener("resize", onSize); window.addEventListener("orientationchange", onSize); window.visualViewport?.addEventListener("resize", onSize);
    onSize();
    return () => { sc.removeEventListener("scroll", on); ro.disconnect(); window.removeEventListener("resize", onSize); window.removeEventListener("orientationchange", onSize); window.visualViewport?.removeEventListener("resize", onSize); };
  }, [scroller, stageBars]);
  useEffect(() => { syncRef.current(); }, [count, seasons, minis]);   // new outfits appended / list replaced
  useLayoutEffect(() => { measure(); apply(); });   // freshly mounted groups get their clip before the first paint

  const os = DECOR_OVERSCAN_PX;
  const inBox: DecorStage = stageBars ? { x: os, y: os, w: stage?.w ?? 0, h: stage?.h ?? 0 } : { x: 0, y: 0, w: artSize.w, h: artSize.h };   // the stage inside the art box
  const boxStyle: CSSProperties = stageBars ? (stage && stage.h > 0 ? { position: "fixed", left: stage.x - os, top: stage.y - os, width: stage.w + 2 * os, height: stage.h + 2 * os } : { position: "fixed", left: 0, top: 0, width: 0, height: 0 }) : (artClassName ? artStyle : style) ?? {};
  const shown = win.filter((i) => seasons?.[i] || minis?.specs[i]);
  const group = (i: number, sun: boolean) => (
    <div key={`${i}-${seasons?.[i]}`} data-i={i} className="sd-group absolute inset-0">
      {mode === "pixel" && seasons?.[i] && <div className="absolute inset-0" style={{ zIndex: LAYER_Z.decor }}><Art season={seasons[i]!} width={size.w} height={size.h} sun={sun} safeTop={!!sunFront} /></div>}
      {minis?.specs[i] && <div className="absolute inset-0" style={{ zIndex: LAYER_Z.figure }}><Mannequin spec={minis.specs[i]} layerWidth={size.w} searchOn={minis.searchOn} /></div>}
    </div>
  );
  return (
    <div ref={root} aria-hidden style={{ display: "contents" }}>
      {mode === "art" && <div ref={artBox} className={`pointer-events-none overflow-hidden ${stageBars ? "" : (artClassName ?? className)}`} style={{ ...boxStyle, zIndex: LAYER_Z.decor }}>
        {shown.filter((i) => seasons?.[i]).map((i) => <div key={`${i}-${seasons?.[i]}`} data-i={i} className="sd-art absolute inset-0"><ArtLayers season={seasons![i]!} stage={inBox} /></div>)}
      </div>}
      {debug && <DecorDebug stage={stageBars ? stage : null} box={artBox} inBox={inBox} season={seasons?.[cur] ?? null} mode={mode} />}
      <div className={`pointer-events-none ${className}`} style={{ ...style, zIndex: LAYER_Z.figure }}>{shown.map((i) => group(i, true))}</div>
    </div>
  );
}
export default memo(SeasonDecor);
