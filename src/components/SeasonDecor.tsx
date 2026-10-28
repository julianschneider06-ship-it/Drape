"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { SEASON_DECOR as C } from "@/config/season-decor";
import { decorClip, decorWindow, type DecorSeason } from "@/lib/season-decor";
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

const Art = ({ season, width, height, sun, safeTop }: { season: DecorSeason; width: number; height: number; sun: boolean; safeTop: boolean }) =>
  season === "summer" ? (sun ? <Sun safeTop={safeTop} /> : null) : season === "spring" ? <Meadow width={width} /> : <Spots kind={season} width={width} height={height} />;

/** `scroller` = the snap scroller the outfits live in (offset and height are read from it); `seasons[i]` = decoration of outfit i (null = none).
 *  `minis` = outfit preview figures (same clipping, drawn in front of the season art and still behind the products): `specs[i]` is outfit i's figure, `searchOn` places it over the Profile tab.
 *  `className`/`style` give the layer its box (same box as the scroller). `sunFront`: the layer starts under the status/safe area (feed), so the sun is offset by it. Everything sits behind the products (no z-index). */
function SeasonDecor({ scroller, seasons, minis, className, style, sunFront }: { scroller: RefObject<HTMLElement | null>; seasons: (DecorSeason | null)[] | null; minis?: { specs: MannequinSpec[]; searchOn: boolean } | null; className: string; style?: CSSProperties; sunFront?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState<number[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const winKey = useRef(""), count = Math.max(seasons?.length ?? 0, minis?.specs.length ?? 0);

  const apply = () => {   // clip every group to where its outfit is on screen (direct DOM writes)
    const sc = scroller.current, el = root.current; if (!sc || !el) return;
    const h = sc.clientHeight, st = sc.scrollTop;
    el.querySelectorAll<HTMLElement>(".sd-group").forEach((g) => {
      const c = decorClip(Number(g.dataset.i), st, h);
      g.style.clipPath = c ? `inset(${c.top}px 0px ${c.bottom}px 0px)` : "";
      g.style.visibility = c ? "" : "hidden";
    });
  };
  const sync = () => {
    const sc = scroller.current; if (!sc) return;
    const w = decorWindow(sc.scrollTop, sc.clientHeight, count), k = w.join(",");
    if (k !== winKey.current) { winKey.current = k; setWin(w); }
    setSize((p) => (p.w === sc.clientWidth && p.h === sc.clientHeight ? p : { w: sc.clientWidth, h: sc.clientHeight }));
    apply();
  };
  const syncRef = useRef(sync); syncRef.current = sync;

  useEffect(() => {
    const sc = scroller.current; if (!sc) return;
    const on = () => syncRef.current();
    sc.addEventListener("scroll", on, { passive: true });
    const ro = new ResizeObserver(on); ro.observe(sc);
    on();
    return () => { sc.removeEventListener("scroll", on); ro.disconnect(); };
  }, [scroller]);
  useEffect(() => { syncRef.current(); }, [count, seasons, minis]);   // new outfits appended / list replaced
  useLayoutEffect(() => { apply(); });   // freshly mounted groups get their clip before the first paint

  const shown = win.filter((i) => seasons?.[i] || minis?.specs[i]);
  const group = (i: number, sun: boolean) => (
    <div key={`${i}-${seasons?.[i]}`} data-i={i} className="sd-group absolute inset-0">
      {seasons?.[i] && <Art season={seasons[i]!} width={size.w} height={size.h} sun={sun} safeTop={!!sunFront} />}
      {minis?.specs[i] && <Mannequin spec={minis.specs[i]} layerWidth={size.w} searchOn={minis.searchOn} />}
    </div>
  );
  return (
    <div ref={root} aria-hidden style={{ display: "contents" }}>
      <div className={`pointer-events-none ${className}`} style={style}>{shown.map((i) => group(i, true))}</div>
    </div>
  );
}
export default memo(SeasonDecor);
