"use client";
import { memo, useEffect, useMemo, useRef } from "react";
import { animate } from "motion/react";
import { STRIPE_BG as C } from "@/config/stripe-bg";
import { gradientCss, stripeCss } from "@/lib/stripe-bg";

/** Ribbed-glass background of the For You feed: fixed to the screen (does not scroll), behind everything, pointer-events none. Two gradient layers crossfade
 *  (opacity only) when the colours change; the stripe overlay is static on top, so nothing flickers. `colors` = palette of the outfit in view. */
function StripeBackground({ colors, className, style }: { colors: readonly string[]; className: string; style?: React.CSSProperties }) {
  const key = colors.join("|");
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null), front = useRef<"a" | "b" | null>(null), last = useRef("");
  const stripes = useMemo(() => stripeCss(), []);
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
    <div aria-hidden className={`pointer-events-none ${className}`} style={{ ...style, background: C.fallbackColor }}>
      <div ref={a} className="absolute inset-0" style={{ opacity: 0 }} />
      <div ref={b} className="absolute inset-0" style={{ opacity: 0 }} />
      <div className="absolute inset-0" style={{ background: stripes }} />
    </div>
  );
}
export default memo(StripeBackground);
