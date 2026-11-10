"use client";
import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { animate } from "motion/react";
import { BG_FADE_MS } from "@/config/background-images";
import { DURATION_MS, sec } from "@/config/motion";
import { useLensSource, type LensSource } from "@/lib/client/lens-source";
import { useGlassOverrides } from "@/lib/client/stripe-bg";
import { useReducedMotion } from "@/lib/motion";
import { glassSheenStyle, liquidValues } from "@/lib/stripe-bg";
import StripeBackground from "./StripeBackground";

interface Box { l: number; t: number; w: number; h: number; vw: number; vh: number }
const fill: CSSProperties = { position: "absolute", inset: 0 };

/** Picture copy: same cover crop as the page picture; a new picture fades in over the old one (opacity only, same timing). */
function LensPicture({ src, veil }: { src: string; veil: { color: "white" | "black"; opacity: number } }) {
  const [list, setList] = useState<string[]>([src]), reduced = useReducedMotion(), ref = useRef<HTMLImageElement>(null);
  if (list[list.length - 1] !== src) setList((p) => [...p.slice(-1), src]);
  const top = list[list.length - 1];
  return (
    <>
      {list.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s} ref={s === top && list.length > 1 ? ref : undefined} src={s} alt="" draggable={false} decoding="async" className="absolute inset-0 h-full w-full" style={{ objectFit: "cover", objectPosition: "center", opacity: s === top && list.length > 1 ? 0 : 1 }}
          onLoad={(e) => { if (s !== top || list.length < 2) return; const el = e.currentTarget; animate(el, { opacity: 1 }, { duration: sec(reduced ? DURATION_MS.reducedFade : BG_FADE_MS), ease: "easeInOut" }).then(() => setList([s]), () => setList([s])); }} />
      ))}
      <div style={{ ...fill, background: veil.color, opacity: veil.opacity }} />
    </>
  );
}

function LensCopy({ source }: { source: LensSource }) {
  return source.kind === "picture"
    ? <LensPicture src={source.src} veil={source.veil} />
    : <StripeBackground mode={source.mode} colors={source.colors} seed={source.seed} lensOwner={null} className="absolute inset-0" />;
}

/** Light layers + lens copy of a LIQUID glass bar. Put it as a child of the bar (the bar has `backdrop-filter`, so it is a stacking context; this layer sits at z -1: above the bar's own fill, below its icons / text).
 *  Lens = a copy of the page background (Pictures image or Stripe pattern) positioned like the page background in viewport coordinates (viewport-sized box shifted by the bar's offset with a transform), zoomed about the bar centre, clipped to the bar's rounded shape.
 *  Measured only on mount / resize (ResizeObserver + resize events), no per-frame work. Plain white background = no copy, just the light layers. pointer-events none. */
function GlassLayers() {
  const root = useRef<HTMLDivElement>(null), [box, setBox] = useState<Box | null>(null), source = useLensSource(), ov = useGlassOverrides();
  useLayoutEffect(() => {
    const el = root.current, bar = el?.parentElement; if (!el || !bar) return;
    const measure = () => { const r = bar.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight; setBox((p) => (p && p.l === r.left && p.t === r.top && p.w === r.width && p.h === r.height && p.vw === vw && p.vh === vh ? p : { l: r.left, t: r.top, w: r.width, h: r.height, vw, vh })); };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(bar);
    window.addEventListener("resize", measure); window.visualViewport?.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, []);
  const css = useMemo(() => glassSheenStyle(), []), zoom = liquidValues(ov).zoom;
  return (
    <div ref={root} aria-hidden data-glass-layers style={{ ...fill, zIndex: -1, borderRadius: "inherit", overflow: "hidden", isolation: "isolate", transform: "translateZ(0)", pointerEvents: "none" }}>
      {source && box && (
        <div style={{ position: "absolute", left: 0, top: 0, width: box.vw, height: box.vh, overflow: "hidden", transformOrigin: `${box.l + box.w / 2}px ${box.t + box.h / 2}px`, transform: `translate(${-box.l}px, ${-box.t}px) scale(${zoom})` }}>
          <LensCopy source={source} />
        </div>
      )}
      <div style={{ ...fill, borderRadius: "inherit", ...css.sheen }} />
      <div style={{ ...fill, borderRadius: "inherit", ...css.edge }} />
    </div>
  );
}
export default memo(GlassLayers);
