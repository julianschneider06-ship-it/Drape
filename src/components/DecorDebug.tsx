"use client";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { DECOR_ART } from "@/config/season-decor";
import { computeDecorRect, type DecorSeason, type DecorStage } from "@/lib/season-decor";

// Debug overlay for the seasonal decoration, only mounted with the link parameter ?decordebug=1 (no switch, no persistence).
// Red = viewport, green = stage (outfit area between header and tab bar), blue = every decoration layer with a label. Pointer-events none.
const box = (c: string, r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ position: "fixed", left: r.x, top: r.y, width: r.w, height: r.h, outline: `1px solid ${c}`, outlineOffset: -1, pointerEvents: "none" });
const f = (n: number) => Math.round(n * 10) / 10;

export default function DecorDebug({ stage, box: artBox, inBox, season, mode }: { stage: DecorStage | null; box: RefObject<HTMLElement | null>; inBox: DecorStage; season: DecorSeason | null; mode: string }) {
  const probe = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0), [safe, setSafe] = useState("0/0/0/0");
  useEffect(() => {
    const on = () => { bump((n) => n + 1); const p = probe.current; if (p) { const c = getComputedStyle(p); setSafe([c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((v) => Math.round(parseFloat(v) || 0)).join("/")); } };
    on(); window.addEventListener("resize", on); window.visualViewport?.addEventListener("resize", on);
    return () => { window.removeEventListener("resize", on); window.visualViewport?.removeEventListener("resize", on); };
  }, []);
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const br = artBox.current?.getBoundingClientRect();
  const st: DecorStage = stage ?? { x: (br?.left ?? 0) + inBox.x, y: (br?.top ?? 0) + inBox.y, w: inBox.w, h: inBox.h };
  const hdr = document.querySelector("[data-stage-top]")?.getBoundingClientRect(), bar = document.querySelector("[data-stage-bottom]")?.getBoundingClientRect();
  const layers = season ? DECOR_ART[season].map((l) => ({ name: l.src.split("/").pop()!.replace(".webp", ""), r: computeDecorRect(l, st) })) : [];
  const t: CSSProperties = { position: "fixed", pointerEvents: "none", font: "10px/1.25 ui-monospace, monospace", color: "#fff", background: "rgba(0,0,0,0.65)", padding: "1px 3px", whiteSpace: "pre" };
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none" }}>
      <div ref={probe} style={{ position: "fixed", visibility: "hidden", paddingTop: "env(safe-area-inset-top, 0px)", paddingRight: "env(safe-area-inset-right, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)" }} />
      <div style={box("red", { x: 0, y: 0, w: vw, h: vh })} />
      <div style={box("#00b050", st)} />
      {layers.map((l) => l.r && (
        <div key={l.name}>
          <div style={box("#2563eb", l.r)} />
          <div style={{ ...t, left: Math.max(0, l.r.x), top: Math.min(vh - 14, l.r.y + l.r.h / 2), background: "rgba(37,99,235,0.85)" }}>{`${l.name} ${f(l.r.x)},${f(l.r.y)} ${f(l.r.w)}x${f(l.r.h)}`}</div>
        </div>
      ))}
      <div style={{ ...t, left: 4, top: st.y + 4 }}>{`viewport ${vw}x${vh}  safe(t/r/b/l) ${safe}\nheader h ${f(hdr?.height ?? 0)}  tab bar h ${f(bar?.height ?? 0)}\nstage x${f(st.x)} y${f(st.y)} ${f(st.w)}x${f(st.h)}\nseason ${season ?? "none"}  decor ${mode}`}</div>
    </div>
  );
}
