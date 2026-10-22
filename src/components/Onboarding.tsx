"use client";
import { useEffect, useState } from "react";
import { RING } from "@/lib/client/sale";

/** First-visit tutorial overlay (steps 1-3). It never blocks gestures (pointer-events none) except the "Got it" button; no dimming.
 *  Boxes and arrows use the same hand-drawn technique as the red sale outline (see SaleInkDefs): dilate the silhouette, wobble it with
 *  noise, keep only the ring and paint it (here black) under the shape. Lines get the same noise displacement. */
const INK = "#111";
export function OnboardingInkDefs() {
  const r = RING.l;
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <filter id="drape-ob-ink" x="-15%" y="-15%" width="130%" height="130%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius={r.grow} result="grown" />
        <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="grown" in2="noise" scale={r.wobble} xChannelSelector="R" yChannelSelector="G" result="wobbly" />
        <feMorphology in="SourceAlpha" operator="dilate" radius={r.core} result="core" />
        <feComposite in="wobbly" in2="core" operator="out" result="ring" />
        <feFlood floodColor={INK} result="ink" />
        <feComposite in="ink" in2="ring" operator="in" result="line" />
        <feMerge><feMergeNode in="line" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
      <filter id="drape-ob-line" filterUnits="userSpaceOnUse" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

interface Pt { x: number; y: number }
interface Rect { x: number; y: number; w: number; h: number }
const rectOf = (el: Element | null): Rect | null => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; };
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** hand-drawn arrow from a to b: a slightly bent line with an open arrowhead */
function Arrow({ a, b }: { a: Pt; b: Pt }) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 + (-dy / len) * 26, y: (a.y + b.y) / 2 + (dx / len) * 26 };   // control point: bend sideways
  const tx = b.x - c.x, ty = b.y - c.y, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  const head = (deg: number) => { const k = (deg * Math.PI) / 180, cos = Math.cos(k), sin = Math.sin(k); return `M${b.x} ${b.y} l${-(ux * cos - uy * sin) * 16} ${-(ux * sin + uy * cos) * 16}`; };
  return (
    <svg className="pointer-events-none fixed inset-0 z-40 h-full w-full" aria-hidden>
      <g filter="url(#drape-ob-line)" fill="none" stroke={INK} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`} />
        <path d={head(28)} /><path d={head(-28)} />
      </g>
    </svg>
  );
}

const boxStyle = { background: "#fff", color: INK, filter: "url(#drape-ob-ink)", fontSize: 15, lineHeight: 1.3, padding: "11px 14px", borderRadius: 6 } as const;

/** step 1: a big hand-drawn arrow pointing up with the text inside (the user swipes up to the next outfit) */
function UpArrow() {
  return (
    <div role="status" className="ob-nudge pointer-events-none fixed left-1/2 z-40" style={{ top: "calc(50% - 120px)", width: 210, height: 290, marginLeft: -105 }}>
      <svg width="210" height="290" viewBox="0 0 210 290" style={{ filter: "url(#drape-ob-ink)", overflow: "visible" }} aria-hidden>
        <polygon points="105,6 204,108 150,108 150,284 60,284 60,108 6,108" fill="#fff" strokeLinejoin="round" />
      </svg>
      <p className="absolute text-center" style={{ left: 66, width: 78, top: 124, fontSize: 15, lineHeight: 1.25, color: INK }}>Swipe up to see the next outfit</p>
    </div>
  );
}

/** steps 2 and 3: text box with an arrow to a piece of outfit B (measured from the DOM, so it follows the layout and swaps) */
function Pointer({ step, onDone, onNoSale }: { step: 2 | 3; onDone: () => void; onNoSale: () => void }) {
  const [rects, setRects] = useState<{ top: Rect | null; sale: Rect | null }>({ top: null, sale: null });
  const [vp, setVp] = useState({ w: 390, h: 800 });
  useEffect(() => {
    const measure = () => {
      const sec = document.querySelector('section[data-ob="B"]');
      const label = sec?.querySelector('[data-slot="shoes"] [data-sale-label]') ?? sec?.querySelector("[data-sale-label]") ?? null;
      const next = { top: rectOf(sec?.querySelector('[data-slot="top"]') ?? null), sale: rectOf(label) ?? null };
      setVp((p) => (p.w === innerWidth && p.h === innerHeight ? p : { w: innerWidth, h: innerHeight }));
      setRects((p) => (JSON.stringify(p) === JSON.stringify(next) ? p : next));
    };
    measure();
    const t = setInterval(measure, 120);
    return () => clearInterval(t);
  }, [step]);
  // step 3 needs a visible sale label; if the piece is no longer on sale (or has no label), end the tutorial instead of pointing at nothing
  useEffect(() => {
    if (step !== 3) return;
    const t = setTimeout(() => { if (!document.querySelector('section[data-ob="B"] [data-sale-label]')) onNoSale(); }, 700);
    return () => clearTimeout(t);
  }, [step, onNoSale]);

  const W = Math.min(250, vp.w - 24);
  if (step === 2) {
    const T = rects.top; if (!T) return null;
    const cx = T.x + T.w / 2, left = clamp(cx - W / 2, 12, vp.w - W - 12), y0 = Math.min(T.y + T.h + 52, vp.h - 220);
    const ax = clamp(cx, left + 30, left + W - 30);
    return (
      <>
        <Arrow a={{ x: ax, y: y0 }} b={{ x: clamp(cx, T.x + 18, T.x + T.w - 18), y: Math.max(T.y + T.h - 14, T.y + 20) }} />
        <p role="status" className="ob-fade pointer-events-none fixed z-40 text-center" style={{ ...boxStyle, left, top: y0, width: W }}>Swipe left or right to see alternatives</p>
      </>
    );
  }
  const S = rects.sale; if (!S) return null;
  const tx = S.x + S.w / 2, left = clamp(tx - W / 2 + 60, 12, vp.w - W - 12), yb = Math.max(S.y - 56, 150);
  const ax = clamp(tx, left + 34, left + W - 34), btnLeft = ax > left + W / 2;
  return (
    <>
      <Arrow a={{ x: ax, y: yb }} b={{ x: tx, y: S.y - 6 }} />
      <div className="ob-fade pointer-events-none fixed z-40" style={{ left, bottom: vp.h - yb, width: W }}>
        <p role="status" className="text-center" style={boxStyle}>Red mark = on sale</p>
      </div>
      <button type="button" onClick={onDone} className="ob-fade fixed z-40 active:scale-95" style={{ ...boxStyle, top: yb + 12, left: btnLeft ? left : left + W - 104, width: 104, textAlign: "center", pointerEvents: "auto", cursor: "pointer", font: "inherit", fontSize: 15 }}>Got it</button>
    </>
  );
}

export default function Onboarding({ step, onDone, onNoSale }: { step: 1 | 2 | 3; onDone: () => void; onNoSale: () => void }) {
  return (
    <>
      <OnboardingInkDefs />
      {step === 1 ? <UpArrow /> : <Pointer step={step} onDone={onDone} onNoSale={onNoSale} />}
    </>
  );
}
