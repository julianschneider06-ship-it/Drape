"use client";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { SEASON_DECOR as C } from "@/config/season-decor";
import { decorClip, decorWindow, type DecorSeason } from "@/lib/season-decor";
import Mannequin from "./Mannequin";
import type { MannequinSpec } from "@/lib/mannequin";
import { flakeArt, leafArt, meadowArt, spotPieces, sunArt } from "@/lib/season-decor-art";

// Screen-anchored seasonal decoration. One layer sits over the scroll area; for the (at most 3) outfits near the viewport it holds that outfit's decoration,
// clipped to the part of the screen where THAT outfit is visible. The decorations never move; only the clip windows follow the scroll offset, written
// straight to the DOM from the scroll event (no React render per frame). Behind the outfits, pointer-events none.
const INK = C.ink;
const nonScaling = { vectorEffect: "non-scaling-stroke" } as const;

function Sun({ safeTop }: { safeTop: boolean }) {
  const a = useMemo(() => sunArt(), []), s = C.sun;
  return (
    <svg className="absolute right-0" style={{ top: safeTop ? `calc(env(safe-area-inset-top, 0px) + ${s.topOffsetPx}px)` : s.topOffsetPx, opacity: C.opacity }} width={s.sizePx} height={s.sizePx} viewBox={`0 0 ${s.sizePx} ${s.sizePx}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {a.rays.map((d, i) => <path key={i} d={d} stroke={s.color} strokeWidth={INK.width} />)}
      <path d={a.disc} fill={s.color} stroke={s.color} strokeWidth={INK.width} />
    </svg>
  );
}

function Meadow({ width }: { width: number }) {
  const a = useMemo(() => meadowArt(width), [width]), m = C.meadow;
  if (!(width > 0)) return null;
  return (
    <svg className="absolute left-0" style={{ bottom: "var(--safe-b, 0px)", opacity: C.opacity }} width={width} height={a.height} viewBox={`0 0 ${width} ${a.height}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={a.band} fill={m.color} stroke={m.color} strokeWidth={INK.width} />
      {a.blades.map((d, i) => <path key={i} d={d} stroke={m.color} strokeWidth={INK.width} />)}
    </svg>
  );
}

function Spots({ kind, width }: { kind: "autumn" | "winter"; width: number }) {
  const pieces = useMemo(() => C.spots.places.map((_, i) => spotPieces(i, width).map((p) => ({ p, leaf: leafArt(p.seed), flake: flakeArt(p.seed) }))), [width]);
  return (
    <>
      {C.spots.places.map((pl, pi) => (
        <div key={pi} className="absolute" style={{ left: `${pl.x * 100}%`, top: `${pl.y0 * 100}%`, height: `${(pl.y1 - pl.y0) * 100}%`, width: 1 }}>
          {pieces[pi].map(({ p, leaf, flake }) => (
            <svg key={p.seed} className="absolute" style={{ left: p.dx, top: `${p.yFrac * 100}%`, opacity: p.opacity, transform: `rotate(${p.tilt}deg)` }} width={p.size} height={p.size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              {kind === "autumn" ? (
                <>
                  <path d={leaf.body} fill={C.leaves.color} stroke={C.leaves.color} strokeWidth={INK.width * 0.8} {...nonScaling} />
                  <path d={leaf.stem} stroke={C.leaves.color} strokeWidth={INK.width * 0.8} {...nonScaling} />
                </>
              ) : (
                <path d={flake} stroke={C.snow.color} strokeWidth={INK.width} {...nonScaling} />
              )}
            </svg>
          ))}
        </div>
      ))}
    </>
  );
}

const Art = ({ season, width, sun, safeTop }: { season: DecorSeason; width: number; sun: boolean; safeTop: boolean }) =>
  season === "summer" ? (sun ? <Sun safeTop={safeTop} /> : null) : season === "spring" ? <Meadow width={width} /> : <Spots kind={season} width={width} />;

/** `scroller` = the snap scroller the outfits live in (offset and height are read from it); `seasons[i]` = decoration of outfit i (null = none).
 *  `minis` = outfit preview figures (same clipping, drawn in front of the season art and still behind the products): `specs[i]` is outfit i's figure, `searchOn` places it over the Wishlist tab.
 *  `className`/`style` give the layer its box (same box as the scroller). `sunFront`: the layer starts under the status/safe area (feed), so the sun is offset by it. Everything sits behind the products (no z-index). */
function SeasonDecor({ scroller, seasons, minis, className, style, sunFront }: { scroller: RefObject<HTMLElement | null>; seasons: (DecorSeason | null)[] | null; minis?: { specs: MannequinSpec[]; searchOn: boolean } | null; className: string; style?: CSSProperties; sunFront?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState<number[]>([]);
  const [width, setWidth] = useState(0);
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
    setWidth((p) => (p === sc.clientWidth ? p : sc.clientWidth));
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
      {seasons?.[i] && <Art season={seasons[i]!} width={width} sun={sun} safeTop={!!sunFront} />}
      {minis?.specs[i] && <Mannequin spec={minis.specs[i]} layerWidth={width} searchOn={minis.searchOn} />}
    </div>
  );
  return (
    <div ref={root} aria-hidden style={{ display: "contents" }}>
      <div className={`pointer-events-none ${className}`} style={style}>{shown.map((i) => group(i, true))}</div>
    </div>
  );
}
export default memo(SeasonDecor);
