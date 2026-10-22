"use client";
import { memo, type ReactNode } from "react";
import { ACTION_RAIL_WIDTH } from "@/config/action-rail";

export interface RailAction { id: string; label: string; active: boolean; onPress: () => void; icon: (active: boolean) => ReactNode }

const HeartIcon = (on: boolean) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" />
  </svg>
);

/** The rail's actions, top to bottom. Add more entries here later. */
export const heartAction = (active: boolean, onPress: () => void): RailAction => ({ id: "like-outfit", label: active ? "Unlike all pieces of this outfit" : "Like all pieces of this outfit", active, onPress, icon: HeartIcon });

/** Slim vertical rail at the right edge of the outfit card, vertically centred. Thin line icons like the bottom bar; no labels. */
function ActionRail({ actions }: { actions: RailAction[] }) {
  return (
    <div className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center" style={{ width: ACTION_RAIL_WIDTH }}>
      {actions.map((a) => (
        <button key={a.id} type="button" onClick={a.onPress} aria-label={a.label} aria-pressed={a.active}
          className={`flex items-center justify-center text-black transition-transform duration-150 active:scale-90 ${a.active ? "" : "text-neutral-700"}`} style={{ width: ACTION_RAIL_WIDTH, height: ACTION_RAIL_WIDTH }}>
          {a.icon(a.active)}
        </button>
      ))}
    </div>
  );
}
export default memo(ActionRail);
