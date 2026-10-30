"use client";
import { memo, useEffect, useMemo, useRef } from "react";
import { animate } from "motion/react";
import { STRIPE_BG as C } from "@/config/stripe-bg";
import { curveSlices, gradientCss, specularCss, stripeCss } from "@/lib/stripe-bg";

/** Liquid-glass background of the For You feed: full screen (behind status bar, header and tab bar, down to the physical bottom edge), fixed, behind everything, pointer-events none.
 *  Two gradient layers crossfade (opacity only) when the colours change; stripes and highlight are static on top. The last `curve.zonePx` px tilt the stripes gently to the left. */
function StripeBackground({ colors, className, style }: { colors: readonly string[]; className: string; style?: React.CSSProperties }) {
  const key = colors.join("|");
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null), front = useRef<"a" | "b" | null>(null), last = useRef("");
  const stripes = useMemo(() => stripeCss(), []), spec = useMemo(() => specularCss(), []), slices = useMemo(() => curveSlices(), []);
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
      <div className="absolute inset-x-0 top-0" style={{ bottom: C.curve.zonePx, background: stripes }} />
      {slices.map((s, i) => (
        <div key={i} className="absolute inset-x-0 overflow-hidden" style={{ bottom: C.curve.zonePx - s.topPx - s.heightPx, height: s.heightPx }}>
          <div className="absolute" style={{ left: "-20%", right: "-20%", top: 0, height: s.heightPx * 3, background: stripes, transformOrigin: "50% 0", transform: `translateX(${s.shiftPx}px) rotate(${s.deg}deg)` }} />
        </div>
      ))}
      <div className="absolute inset-0" style={{ background: spec }} />
    </div>
  );
}
export default memo(StripeBackground);
