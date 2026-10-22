"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { animate } from "motion/react";
import { DURATION_MS, LIKE_POP, SPRING, sec } from "@/config/motion";
import { LIKE_PULSE_COLORS } from "@/config/product-gesture";
import { useReducedMotion } from "@/lib/motion";

export interface LikePopHandle { play: (liked: boolean) => void }
type Ctl = { stop: () => void };

/** Double-tap like feedback on one product: a heart pops over it, drifts up and fades, and the product (the parent element) gets a tiny scale impulse.
 *  Always mounted but invisible at rest; played imperatively (no React state, no re-render of the outfit card). A new play stops the running one. */
const LikePop = forwardRef<LikePopHandle>(function LikePop(_, ref) {
  const el = useRef<SVGSVGElement>(null);
  const token = useRef(0), running = useRef<Ctl[]>([]);
  const reduced = useReducedMotion();
  const stopAll = () => { running.current.forEach((c) => c.stop()); running.current = []; };
  const go = (c: Ctl & { finished: Promise<unknown> }) => { running.current.push(c); return c.finished.catch(() => {}); };

  useImperativeHandle(ref, () => ({
    play(liked) {
      const svg = el.current; if (!svg) return;
      const piece = svg.parentElement as HTMLElement | null;
      const t = ++token.current;
      stopAll();
      const alive = () => t === token.current;
      const col = liked ? LIKE_PULSE_COLORS.liked : LIKE_PULSE_COLORS.unliked;
      svg.setAttribute("fill", liked ? col : "none"); svg.setAttribute("stroke", col);
      const size = liked ? LIKE_POP.size : LIKE_POP.undo.size;
      svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size));
      svg.style.marginLeft = svg.style.marginTop = `${-size / 2}px`;
      svg.style.willChange = "transform, opacity";
      (async () => {
        if (reduced) {                       // no movement: a short fade only
          animate(svg, { opacity: 0, scale: 1, y: 0 }, { duration: 0 });
          await go(animate(svg, { opacity: liked ? 1 : LIKE_POP.undo.opacity }, { duration: sec(DURATION_MS.reducedFade) }));
          if (alive()) await go(animate(svg, { opacity: 0 }, { duration: sec(DURATION_MS.reducedFade) }));
        } else if (liked) {
          animate(svg, { opacity: 0, scale: LIKE_POP.startScale, y: 0 }, { duration: 0 });
          if (piece) go(animate(piece, { scale: LIKE_POP.pieceImpulse }, SPRING.press)).then(() => alive() && go(animate(piece, { scale: 1 }, SPRING.settle)));
          go(animate(svg, { opacity: 1 }, { duration: sec(DURATION_MS.fadeIn) }));
          go(animate(svg, { y: LIKE_POP.driftPx * 0.4 }, { duration: 0.25, ease: "easeOut" }));
          await go(animate(svg, { scale: LIKE_POP.peakScale }, SPRING.pop));
          if (!alive()) return;
          go(animate(svg, { scale: 1 }, SPRING.settle));
          go(animate(svg, { y: LIKE_POP.driftPx }, { duration: sec(DURATION_MS.fadeOut), ease: "easeOut" }));
          await go(animate(svg, { opacity: 0 }, { duration: sec(DURATION_MS.fadeOut), ease: "easeIn" }));
        } else {                             // gentle undo: outline heart, small, fades out
          animate(svg, { opacity: 0, scale: LIKE_POP.undo.startScale, y: 0 }, { duration: 0 });
          go(animate(svg, { opacity: LIKE_POP.undo.opacity, scale: 1 }, { duration: sec(DURATION_MS.fadeIn), ease: "easeOut" }));
          go(animate(svg, { y: LIKE_POP.undo.driftPx }, { duration: sec(LIKE_POP.undo.totalMs), ease: "easeOut" }));
          await new Promise((r) => setTimeout(r, DURATION_MS.fadeIn));
          if (alive()) await go(animate(svg, { opacity: 0 }, { duration: sec(LIKE_POP.undo.totalMs - DURATION_MS.fadeIn), ease: "easeIn" }));
        }
        if (alive()) { svg.style.willChange = ""; }
      })();
    },
  }), [reduced]);

  useEffect(() => () => { token.current++; stopAll(); }, []);

  return (
    <svg ref={el} aria-hidden data-like-pulse="1" className="pointer-events-none absolute" width={LIKE_POP.size} height={LIKE_POP.size} viewBox="0 0 24 24" strokeWidth="1.6" strokeLinejoin="round"
      style={{ left: "50%", top: "50%", marginLeft: -LIKE_POP.size / 2, marginTop: -LIKE_POP.size / 2, opacity: 0, zIndex: 80 }}>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" />
    </svg>
  );
});
export default LikePop;
