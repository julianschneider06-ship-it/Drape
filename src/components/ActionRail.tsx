"use client";
import { memo, type ReactNode } from "react";
import { ACTION_RAIL_WIDTH, RAIL_HEART } from "@/config/action-rail";
import { heartFillTransition } from "@/lib/heart-motion";
import { useHeartMotion } from "@/lib/use-heart-motion";

export interface RailAction { id: string; label: string; active: boolean; onPress: () => void; icon: (active: boolean, reduced: boolean) => ReactNode }

const HeartIcon = (on: boolean, reduced: boolean) => (
  <svg width={RAIL_HEART.size} height={RAIL_HEART.size} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" style={{ fill: on ? RAIL_HEART.likedFill : RAIL_HEART.restFill, stroke: on ? RAIL_HEART.likedStroke : RAIL_HEART.restStroke, filter: on ? undefined : RAIL_HEART.restShadow, overflow: "visible", transition: heartFillTransition(reduced) }} aria-hidden>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" />
  </svg>
);

/** The rail's actions, top to bottom. Add more entries here later. */
export const heartAction = (active: boolean, onPress: () => void): RailAction => ({ id: "like-outfit", label: active ? "Unlike all pieces of this outfit" : "Like all pieces of this outfit", active, onPress, icon: HeartIcon });

function RailButton({ a }: { a: RailAction }) {
  const { ref, bind, reduced } = useHeartMotion(a.active);   // press feedback + pop come from src/config/motion.ts
  return (
    <button type="button" onClick={a.onPress} aria-label={a.label} aria-pressed={a.active} {...bind}
      className={`pointer-events-auto flex items-center justify-center text-black ${a.active ? "" : "text-neutral-700"}`} style={{ width: ACTION_RAIL_WIDTH, height: ACTION_RAIL_WIDTH }}>
      <span ref={ref as React.RefObject<HTMLSpanElement>} className="flex">{a.icon(a.active, reduced)}</span>
    </button>
  );
}

/** Slim vertical rail at the right edge of the outfit card, vertically centred. Thin line icons like the bottom bar; no labels. */
function ActionRail({ actions }: { actions: RailAction[] }) {
  return (
    <div className="pointer-events-none absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center" style={{ width: ACTION_RAIL_WIDTH }}>
      {actions.map((a) => <RailButton key={a.id} a={a} />)}
    </div>
  );
}
export default memo(ActionRail);
