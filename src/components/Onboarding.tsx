"use client";
import { RING } from "@/lib/client/sale";

/** First-visit tutorial overlay (steps 1-3). It never blocks gestures (pointer-events none) except the "Got it" button; no dimming.
 *  Boxes and arrows use the same hand-drawn technique as the red sale outline (see SaleInkDefs): dilate the silhouette, wobble it with
 *  noise, keep only the ring and paint it (here black) under the shape. Lines get the same noise displacement.
 *  Performance: the filtered shapes are rasterised ONCE as SVG images (data URLs), so animating or fading them is a cheap GPU transform /
 *  opacity change and the filter never runs again while the user swipes. */
const INK = "#111", M = 12;   // M = margin around a shape so the wobbling ring is not cut
const r = RING.l;
const FILTERS =
  `<filter id="ink" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">` +
  `<feMorphology in="SourceAlpha" operator="dilate" radius="${r.grow}" result="grown"/><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="noise"/>` +
  `<feDisplacementMap in="grown" in2="noise" scale="${r.wobble}" xChannelSelector="R" yChannelSelector="G" result="wobbly"/><feMorphology in="SourceAlpha" operator="dilate" radius="${r.core}" result="core"/>` +
  `<feComposite in="wobbly" in2="core" operator="out" result="ring"/><feFlood flood-color="${INK}" result="paint"/><feComposite in="paint" in2="ring" operator="in" result="line"/>` +
  `<feMerge><feMergeNode in="line"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
  `<filter id="line" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="noise"/>` +
  `<feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>`;
const svgUrl = (w: number, h: number, body: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${FILTERS}</defs>${body}</svg>`);

const ARROW_W = 210, ARROW_H = 290;
const upArrowUrl = svgUrl(ARROW_W + 2 * M, ARROW_H + 2 * M, `<polygon transform="translate(${M} ${M})" points="105,6 204,108 150,108 150,284 60,284 60,108 6,108" fill="#fff" stroke-linejoin="round" filter="url(#ink)"/>`);
const boxCache = new Map<string, string>();
const boxUrl = (w: number, h: number) => { const k = `${w}x${h}`; let u = boxCache.get(k); if (!u) { u = svgUrl(w + 2 * M, h + 2 * M, `<rect x="${M}" y="${M}" width="${w}" height="${h}" rx="6" fill="#fff" filter="url(#ink)"/>`); boxCache.set(k, u); } return u; };

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface ObRects { top: Rect | null; sale: Rect | null; vw: number; vh: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** hand-drawn arrow from a to b: a slightly bent line with an open arrowhead, as one pre-rendered image */
function Arrow({ a, b }: { a: Pt; b: Pt }) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 + (-dy / len) * 22, y: (a.y + b.y) / 2 + (dx / len) * 22 };   // control point: bend sideways
  const tx = b.x - c.x, ty = b.y - c.y, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl;
  const head = (deg: number) => { const k = (deg * Math.PI) / 180, cos = Math.cos(k), sin = Math.sin(k); return { x: b.x - (ux * cos - uy * sin) * 14, y: b.y - (ux * sin + uy * cos) * 14 }; };
  const h1 = head(28), h2 = head(-28), PAD = 24;
  const xs = [a.x, b.x, c.x, h1.x, h2.x], ys = [a.y, b.y, c.y, h1.y, h2.y];
  const x0 = Math.min(...xs) - PAD, y0 = Math.min(...ys) - PAD, w = Math.ceil(Math.max(...xs) - Math.min(...xs) + 2 * PAD), h = Math.ceil(Math.max(...ys) - Math.min(...ys) + 2 * PAD);
  const p = (q: Pt) => `${(q.x - x0).toFixed(1)} ${(q.y - y0).toFixed(1)}`;
  const url = svgUrl(w, h, `<g filter="url(#line)" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M${p(a)} Q${p(c)} ${p(b)}"/><path d="M${p(b)} L${p(h1)}"/><path d="M${p(b)} L${p(h2)}"/></g>`);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" draggable={false} className="ob-fade pointer-events-none fixed z-40" style={{ left: x0, top: y0, width: w, height: h }} />;
}

const textStyle = { color: INK, fontSize: 15, lineHeight: 1.3 } as const;
/** a fixed-size hand-drawn box with centred text (fixed size = no layout shift, the outline is one image) */
function Box({ left, top, w, h, children, onClick, label }: { left: number; top: number; w: number; h: number; children: React.ReactNode; onClick?: () => void; label?: string }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} aria-label={label} role={onClick ? undefined : "status"} className={`ob-fade fixed z-40 flex items-center justify-center text-center ${onClick ? "active:scale-95" : "pointer-events-none"}`}
      style={{ left, top, width: w, height: h, ...textStyle, font: "inherit", fontSize: 15, padding: "0 14px", pointerEvents: onClick ? "auto" : "none", cursor: onClick ? "pointer" : undefined }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={boxUrl(w, h)} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: -M, top: -M, width: w + 2 * M, height: h + 2 * M }} />
      <span className="relative">{children}</span>
    </Tag>
  );
}

/** step 1: a big hand-drawn arrow pointing up with the text inside (the user swipes up to the next outfit) */
function UpArrow() {
  return (
    <div role="status" className="ob-nudge pointer-events-none fixed left-1/2 z-40" style={{ top: "calc(50% - 120px)", width: ARROW_W, height: ARROW_H, marginLeft: -ARROW_W / 2 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upArrowUrl} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={{ left: -M, top: -M, width: ARROW_W + 2 * M, height: ARROW_H + 2 * M }} />
      <p className="absolute text-center" style={{ left: 66, width: 78, top: 124, ...textStyle }}>Swipe up to see the next outfit</p>
    </div>
  );
}

/** steps 2 and 3: text box with an arrow to a piece of outfit B (positions measured once per step / swap by the parent, no polling) */
function Pointer({ step, rects, onDone }: { step: 2 | 3; rects: ObRects; onDone: () => void }) {
  const { vw, vh } = rects, W = Math.min(250, vw - 24);
  if (step === 2) {
    const T = rects.top; if (!T) return null;
    const H = 66, cx = T.x + T.w / 2, left = clamp(cx - W / 2, 12, vw - W - 12), y0 = Math.min(T.y + T.h + 72, vh - 220);
    return (
      <>
        <Arrow a={{ x: clamp(cx, left + 30, left + W - 30), y: y0 }} b={{ x: clamp(cx, T.x + 18, T.x + T.w - 18), y: Math.max(T.y + T.h - 14, T.y + 20) }} />
        <Box left={left} top={y0} w={W} h={H}>Swipe left or right to see alternatives</Box>
      </>
    );
  }
  const S = rects.sale; if (!S) return null;
  const H = 44, BW = 104, tx = S.x + S.w / 2, left = clamp(tx - W / 2 + 60, 12, vw - W - 12), yb = Math.max(S.y - 56, 150);
  const ax = clamp(tx, left + 34, left + W - 34), btnLeft = ax > left + W / 2 ? left : left + W - BW;
  return (
    <>
      <Arrow a={{ x: ax, y: yb }} b={{ x: tx, y: S.y - 6 }} />
      <Box left={left} top={yb - H} w={W} h={H}>Red mark = on sale</Box>
      <Box left={btnLeft} top={yb + 12} w={BW} h={H} onClick={onDone} label="Got it">Got it</Box>
    </>
  );
}

export default function OnboardingOverlay({ step, rects, onDone }: { step: 1 | 2 | 3; rects: ObRects; onDone: () => void }) {
  return step === 1 ? <UpArrow /> : <Pointer step={step} rects={rects} onDone={onDone} />;
}
