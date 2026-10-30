"use client";
import { memo, useEffect, useMemo, useRef } from "react";
import { animate } from "motion/react";
import { STRIPE_BG as C } from "@/config/stripe-bg";
import { curveSlices, gradientCss, greyBlobsCss, simpleBackgroundCss, simpleStripeCss, specularCss, stripeCss } from "@/lib/stripe-bg";
import type { StripeMode } from "@/lib/shop-pref";

/** Liquid-glass background of the For You feed: full screen (behind status bar, header and tab bar, down to the physical bottom edge), fixed, behind everything, pointer-events none.
 *  Two gradient layers crossfade (opacity only) when the colours change; stripes and highlight are static on top. The last `curve.zonePx` px tilt the stripes gently to the left. */
function StripeBackground({ colors, className, style, mode = "colorful", seed = "" }: { colors: readonly string[]; seed?: string; className: string; style?: React.CSSProperties; mode?: StripeMode }) {
  const simple = mode === "simple";
  const key = simple ? `s:${seed}` : colors.join("|");
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null), front = useRef<"a" | "b" | null>(null), last = useRef("");
  const stripes = useMemo(() => (simple ? simpleStripeCss() : stripeCss()), [simple]), spec = useMemo(() => specularCss(), []), slices = useMemo(() => curveSlices(), []);
  useEffect(() => {
    if (key === last.current) return;
    const first = front.current === null, next = front.current === "a" ? b.current : a.current, prev = front.current === "a" ? a.current : b.current;
    if (!next) return;
    last.current = key;
    next.style.background = simple ? greyBlobsCss(seed) : gradientCss(colors);
    const dur = first ? 0 : C.crossfadeMs / 1000;
    animate(next, { opacity: 1 }, { duration: dur, ease: "easeInOut" });
    if (prev) animate(prev, { opacity: 0 }, { duration: dur, ease: "easeInOut" });
    front.current = front.current === "a" ? "b" : "a";
  }, [key, colors, simple, seed]);
  return (
    <div aria-hidden className={`pointer-events-none ${className}`} style={{ ...style, background: simple ? simpleBackgroundCss() : C.fallbackColor, overflow: "hidden" }}>
      <div ref={a} className="absolute inset-0" style={{ opacity: 0 }} /><div ref={b} className="absolute inset-0" style={{ opacity: 0 }} />
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
