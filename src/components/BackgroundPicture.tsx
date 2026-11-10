"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/react";
import { BG_FADE_MS, BG_PRELOAD_NEXT } from "@/config/background-images";
import { DURATION_MS, sec } from "@/config/motion";
import { LAYER_Z, STAGE_SOURCES, type StageSource } from "@/config/season-decor";
import { comboKey, pickBackground, pieceIds } from "@/lib/background-images";
import { useModeNote, useSeasonMode } from "@/lib/client/season-decor";
import { useReducedMotion } from "@/lib/motion";
import { stageBox, stageFromRects, type DecorStage } from "@/lib/season-decor";
import type { FeedOutfit } from "@/lib/types";

/** The stage (visible outfit area between the header's bottom edge and the tab bar's top edge), measured at runtime. Same rule as the season art. */
function useStage(source: StageSource): DecorStage | null {
  const [stage, setStage] = useState<DecorStage | null>(null);
  useEffect(() => {
    const src = STAGE_SOURCES[source];
    const measure = () => {
      const t = document.querySelector(src.top), b = document.querySelector(src.bottom);
      const n = stageFromRects(t?.getBoundingClientRect() ?? null, b?.getBoundingClientRect() ?? null, document.documentElement.clientWidth, window.innerHeight);
      setStage((p) => (p && p.y === n.y && p.h === n.h && p.w === n.w ? p : n));
    };
    const ro = new ResizeObserver(measure);
    document.querySelectorAll(`${src.top},${src.bottom}`).forEach((e) => ro.observe(e));
    window.addEventListener("resize", measure); window.addEventListener("orientationchange", measure); window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); window.visualViewport?.removeEventListener("resize", measure); };
  }, [source]);
  return stage;
}

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

/** Full-stage background picture of the outfit in view (mode Pictures only). `outfits[index]` = the outfit as shown; the picture is chosen by the pure `pickBackground`
 *  (combination of dominant season x style family, hash of the shown piece ids). Two pictures crossfade when the outfit changes. A picture that fails to load is simply not drawn. */
function BackgroundPicture({ outfits, index, stageSource, onActive }: { outfits: (FeedOutfit | null)[]; index: number; stageSource: StageSource; onActive?: (on: boolean) => void }) {
  const mode = useSeasonMode(), note = useModeNote(), stage = useStage(stageSource);
  const debug = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("decordebug") === "1", []);
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
  if (mode !== "pictures" || !stage || !(stage.h > 0)) return null;
  const b = stageBox(stage);
  return (
    <>
      <div aria-hidden className="pointer-events-none overflow-hidden" style={{ position: "fixed", left: b.x, top: b.y, width: b.w, height: b.h, zIndex: LAYER_Z.image }}>
        {layers.map((l) => (
          <Pic key={l.id} src={l.src}
            onShown={() => setLayers((p) => p.filter((x) => x.id >= l.id))}
            onFail={() => { failed.current.add(l.src); last.current = null; setLayers((p) => p.filter((x) => x.id !== l.id)); }} />
        ))}
      </div>
      {debug && <div aria-hidden style={{ position: "fixed", left: 4, top: stage.y + stage.h - 56, zIndex: 9999, pointerEvents: "none", font: "10px/1.25 ui-monospace, monospace", color: "#fff", background: "rgba(0,0,0,0.65)", padding: "1px 3px", whiteSpace: "pre" }}>
        {`season mode ${mode}${note ? `  (${note})` : ""}\ncombo ${outfits[index] ? comboKey(outfits[index]!.tags) : "-"}  index ${pick?.index ?? "-"}\n${pick ? pick.label : "no image"}`}
      </div>}
    </>
  );
}
export default memo(BackgroundPicture);
