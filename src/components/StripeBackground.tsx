"use client";
import { memo, useEffect, useMemo, useRef } from "react";
import { animate } from "motion/react";
import { STRIPE_BG as C } from "@/config/stripe-bg";
import { edgeCss, gradientCss, panelCss, stripeCss } from "@/lib/stripe-bg";

/** Liquid-glass panel of the For You feed: fixed to the screen (does not scroll), behind everything, pointer-events none. Two gradient layers crossfade
 *  (opacity only) when the colours change; the stripe overlay is static on top, so nothing flickers. `colors` = palette of the outfit in view. */
function StripeBackground({ colors, className, style }: { colors: readonly string[]; className: string; style?: React.CSSProperties }) {
  const key = colors.join("|");
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null), front = useRef<"a" | "b" | null>(null), last = useRef("");
  const stripes = useMemo(() => stripeCss(), []);
  const layer: React.CSSProperties = { opacity: 0, inset: 0 };
  const panel = useMemo(() => panelCss(), []), edge = useMemo(() => edgeCss(), []);
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
    <div aria-hidden className={`pointer-events-none ${className}`} style={style}>
      <div style={{ ...panel, background: C.fallbackColor }}>
        <div ref={a} className="absolute" style={layer} />
        <div ref={b} className="absolute" style={layer} />
        <div className="absolute inset-0" style={{ background: stripes }} />
        <div className="absolute inset-0" style={edge} />
      </div>
    </div>
  );
}
export default memo(StripeBackground);
