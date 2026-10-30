"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/react";
import { STRIPE_BG as C } from "@/config/stripe-bg";
import { bendPaths, gradientCss, specularCss, stripeCss } from "@/lib/stripe-bg";

/** Liquid-glass background of the For You feed: full screen (behind status bar, header and tab bar), fixed, behind everything, pointer-events none. Two gradient layers crossfade
 *  (opacity only) when the colours change; stripes, highlight and the floor bend are static on top, so nothing flickers. `colors` = palette of the outfit in view. */
function StripeBackground({ colors, className, style }: { colors: readonly string[]; className: string; style?: React.CSSProperties }) {
  const key = colors.join("|");
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null), front = useRef<"a" | "b" | null>(null), last = useRef("");
  const stripes = useMemo(() => stripeCss(), []), spec = useMemo(() => specularCss(), []);
  const [w, setW] = useState(0);
  useEffect(() => { const f = () => setW(window.innerWidth); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const paths = useMemo(() => (w ? bendPaths(w) : []), [w]);
  const zone = C.bend.zoneHeightPx, fadeId = "stripe-bend-fade";
  useEffect(() => {
    if (key === last.current) return;
    const first = front.current === null, next = front.current === "a" ? b.current : a.current, prev = front.current === "a" ? a.current : b.current;
    if (!next) return;
    last.current = key;
    next.style.background = gradientCss(colors);
    const dur = first ? 0 : C.crossfadeMs / 1000;
    animate(next, { opacity: 1 }, { duration: dur, ease: "easeInOut" });
    if (prev) animate(prev, { opacity: 0 }, { duration: dur, ease: "easeInOut" });
    front.current = front.current === "a" ? "b" : "a";
  }, [key, colors]);
  return (
    <div aria-hidden className={`pointer-events-none ${className}`} style={{ ...style, background: C.fallbackColor, overflow: "hidden" }}>
      <div ref={a} className="absolute inset-0" style={{ opacity: 0 }} />
      <div ref={b} className="absolute inset-0" style={{ opacity: 0 }} />
      <div className="absolute inset-x-0 top-0" style={{ bottom: `calc(var(--nav-h, 0px) + ${zone}px)`, background: stripes }} />
      {paths.length > 0 && (
        <svg className="absolute inset-x-0" width={w} height={zone} style={{ bottom: "var(--nav-h, 0px)" }}>
          <defs>
            <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={zone}>
              <stop offset={C.bend.fadeFromPx / zone} stopColor="#fff" /><stop offset={C.bend.fadeToPx / zone} stopColor="#000" />
            </linearGradient>
            <mask id={`${fadeId}-m`}><rect width={w} height={zone} fill={`url(#${fadeId})`} /></mask>
          </defs>
          <g mask={`url(#${fadeId}-m)`} fill="none">{paths.map((p, i) => <path key={i} d={p.d} stroke={p.color} strokeWidth={p.width} />)}</g>
        </svg>
      )}
      <div className="absolute inset-0" style={{ background: spec }} />
    </div>
  );
}
export default memo(StripeBackground);
