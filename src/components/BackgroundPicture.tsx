"use client";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { animate } from "motion/react";
import { BG_FADE_MS, BG_PRELOAD_NEXT } from "@/config/background-images";
import { DURATION_MS, sec } from "@/config/motion";
import { LAYER_Z } from "@/config/season-decor";
import { comboKey, pickBackground, pieceIds } from "@/lib/background-images";
import { useModeNote, useSeasonMode, useVeilMode } from "@/lib/client/season-decor";
import { useReducedMotion } from "@/lib/motion";
import { outfitPartColors, parseVeilDebug, resolveVeil } from "@/lib/veil";
import type { FeedOutfit } from "@/lib/types";

/** The whole viewport, under the iOS safe areas, behind header and tab bar (position fixed, inset 0, 100dvh; the image scales to cover and is centre-cropped). */
const FULL: CSSProperties = { position: "fixed", left: 0, top: 0, right: 0, width: "100%", height: "100dvh", minHeight: "100%" };

/** One picture: invisible until it is loaded and decoded, then fades in (opacity only). */
function Pic({ src, onShown, onFail }: { src: string; onShown: () => void; onFail: () => void }) {
  const ref = useRef<HTMLImageElement>(null), reduced = useReducedMotion();
  const show = () => {
    const el = ref.current; if (!el) return;
    const go = () => { animate(el, { opacity: 1 }, { duration: sec(reduced ? DURATION_MS.reducedFade : BG_FADE_MS), ease: "easeInOut" }).then(onShown, onShown); };
    if (el.decode) el.decode().then(go, go); else go();
  };
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt="" decoding="async" draggable={false} onLoad={show} onError={onFail} className="absolute inset-0 h-full w-full" style={{ opacity: 0, objectFit: "cover", objectPosition: "center" }} />;
}

/** The veil over the picture: a white and a black layer whose opacities crossfade (same timing as the pictures). Starts at 0, so the veil fades in with the picture (no dark flash before it is decoded). */
function VeilLayers({ color, opacity }: { color: "white" | "black"; opacity: number }) {
  const w = useRef<HTMLDivElement>(null), k = useRef<HTMLDivElement>(null), reduced = useReducedMotion();
  useEffect(() => {
    const t = { white: color === "white" ? opacity : 0, black: color === "black" ? opacity : 0 };
    for (const [el, v] of [[w.current, t.white], [k.current, t.black]] as const) {
      if (!el) continue;
      animate(el, { opacity: v }, { duration: sec(reduced ? DURATION_MS.reducedFade : BG_FADE_MS), ease: "easeInOut" });
    }
  }, [color, opacity, reduced]);
  const base = { position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" } as const;
  return <><div ref={w} style={{ ...base, background: "white" }} /><div ref={k} style={{ ...base, background: "black" }} /></>;
}

/** Full-SCREEN background picture of the outfit in view (mode Pictures only). `outfits[index]` = the outfit as shown; the picture is chosen by the pure `pickBackground`
 *  (combination of dominant season x style family, hash of the shown piece ids). Two pictures crossfade when the outfit changes. A picture that fails to load is simply not drawn. */
function BackgroundPicture({ outfits, index, onActive }: { outfits: (FeedOutfit | null)[]; index: number; onActive?: (on: boolean) => void }) {
  const mode = useSeasonMode(), note = useModeNote();
  const debug = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("decordebug") === "1", []);
  const veilMode = useVeilMode(), dbgVeil = useMemo(() => parseVeilDebug(typeof window !== "undefined" ? window.location.search : ""), []);
  const pick = useMemo(() => {
    const o = outfits[index]; return mode === "pictures" && o ? pickBackground(o.tags, pieceIds(o)) : null;
  }, [mode, outfits, index]);
  const next = useMemo(() => {
    const o = outfits[index + 1]; return BG_PRELOAD_NEXT && mode === "pictures" && o ? pickBackground(o.tags, pieceIds(o)) : null;
  }, [mode, outfits, index]);
  const [layers, setLayers] = useState<{ id: number; src: string }[]>([]);
  const seq = useRef(0), last = useRef<string | null>(null), failed = useRef(new Set<string>());
  const src = pick && !failed.current.has(pick.src) ? pick.src : null;
  useEffect(() => {
    if (src === last.current) return;
    last.current = src;
    setLayers((p) => (src ? [...p, { id: ++seq.current, src }] : []));
  }, [src]);
  useEffect(() => { if (next && next.src !== pick?.src) { const im = new Image(); im.decoding = "async"; im.src = next.src; } }, [next, pick]);
  useEffect(() => { onActive?.(!!src); }, [src, onActive]);
  const veil = useMemo(() => resolveVeil({ mode: veilMode, names: outfitPartColors(outfits[index]), pictureOn: mode === "pictures" && layers.length > 0, debug: dbgVeil }), [veilMode, outfits, index, mode, layers.length, dbgVeil]);
  if (mode !== "pictures") return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none overflow-hidden" style={{ ...FULL, zIndex: LAYER_Z.image }}>
        {layers.map((l) => (
          <Pic key={l.id} src={l.src}
            onShown={() => setLayers((p) => p.filter((x) => x.id >= l.id))}
            onFail={() => { failed.current.add(l.src); last.current = null; setLayers((p) => p.filter((x) => x.id !== l.id)); }} />
        ))}
      </div>
      {layers.length > 0 && (
        <div aria-hidden className="pointer-events-none overflow-hidden" style={{ ...FULL, zIndex: LAYER_Z.veil }}>
          <VeilLayers color={veil.color} opacity={veil.opacity} />
        </div>
      )}
      {debug && <div aria-hidden style={{ position: "fixed", left: 4, bottom: 120, zIndex: 9999, pointerEvents: "none", font: "10px/1.25 ui-monospace, monospace", color: "#fff", background: "rgba(0,0,0,0.65)", padding: "1px 3px", whiteSpace: "pre" }}>
        {`season mode ${mode}${note ? `  (${note})` : ""}\ncombo ${outfits[index] ? comboKey(outfits[index]!.tags) : "-"}  index ${pick?.index ?? "-"}\nstep ${pick?.step ?? "none"}\nfile ${pick ? `${pick.name}.webp` : "none"}\nveil mode ${veil.mode}${veil.override ? "  DEBUG OVERRIDE active" : ""}\nparts dark ${veil.counts?.dark ?? "-"} light ${veil.counts?.light ?? "-"} mid ${veil.counts?.mid ?? "-"}\nveil ${veil.color} ${veil.opacity.toFixed(3)}`}
      </div>}
    </>
  );
}
export default memo(BackgroundPicture);
