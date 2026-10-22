"use client";
import { memo } from "react";

export type Tab = "foryou" | "search";
/** height of the bar without the phone's bottom safe area */
export const NAV_PX = 49;

const Icon = ({ tab }: { tab: Tab }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {tab === "foryou" ? <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z" /> : <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.7 14.7L19.5 19.5" /></>}
  </svg>
);

/** Slim bottom bar (white, thin grey line on top). Active tab black, inactive grey. Switching only toggles visibility; nothing is recorded. Tapping Search while in Search is passed on too (the configurator reopens). */
function BottomNav({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]" style={{ height: `calc(${NAV_PX}px + env(safe-area-inset-bottom))` }}>
      <div className="mx-auto flex h-[49px] max-w-md" role="tablist">
        {([["foryou", "For You"], ["search", "Search"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => (tab !== t || t === "search") && onTab(t)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${tab === t ? "font-semibold text-black" : "text-neutral-400"}`}>
            <Icon tab={t} />{label}
          </button>
        ))}
      </div>
    </nav>
  );
}
export default memo(BottomNav);
