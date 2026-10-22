"use client";
import { BUTTON_BAR_PX } from "@/lib/layout/config";

export type Reaction = "up" | "down";

// Three stacked thin chevrons with sharp bends; tips point up (like) or down (do not like). No fills, thin dark strokes.
function Chevrons({ dir, on }: { dir: Reaction; on: boolean }) {
  const ys = [0, 6, 12];
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.4 : 1.3} strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit={10}
      style={{ transform: dir === "down" ? "scaleY(-1)" : undefined }} aria-hidden>
      {ys.map((y) => <polyline key={y} points={`4,${y + 8} 12,${y + 2} 20,${y + 8}`} />)}
    </svg>
  );
}

/**
 * Outfit-level buttons: left = I like this outfit (chevrons up), right = I do not like this outfit (chevrons down).
 * Each button is a thin circle (48 px, white, no fill). Pressing toggles (the other one switches, the same one again removes);
 * selected = thicker circle and thicker chevrons. Purely a signal: the feed does not move.
 */
export default function OutfitButtons({ value, onPress }: { value: Reaction | null; onPress: (d: Reaction) => void }) {
  const Btn = ({ dir, label }: { dir: Reaction; label: string }) => {
    const on = value === dir;
    return (
      <button type="button" onClick={() => onPress(dir)} aria-label={on ? `${label} (selected, press to remove)` : label} aria-pressed={on}
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-white text-black transition-[transform,border-color] duration-150 active:scale-95 ${on ? "border-[2.5px] border-black" : "border border-neutral-800"}`}>
        <Chevrons dir={dir} on={on} />
      </button>
    );
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-6 bg-white pb-[var(--safe-b,env(safe-area-inset-bottom))]" style={{ height: `calc(${BUTTON_BAR_PX}px + var(--safe-b, env(safe-area-inset-bottom)))` }}>
      <div className="pointer-events-auto"><Btn dir="up" label="I like this outfit" /></div>
      <div className="pointer-events-auto"><Btn dir="down" label="I do not like this outfit" /></div>
    </div>
  );
}
