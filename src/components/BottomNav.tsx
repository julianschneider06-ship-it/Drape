"use client";
import { memo } from "react";
import * as m from "motion/react-m";
import { navTabs, TAB_LABELS, type Tab } from "@/lib/nav-tabs";
import { MENU, MENU_COLORS, SPRING, DURATION_MS, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { STRIPE_BG } from "@/config/stripe-bg";
import { glassPieceStyle } from "@/lib/stripe-bg";
import { pressProps, stateTransition } from "@/lib/menu-motion";

export type { Tab };
/** height of the bar without the phone's bottom safe area */
export const NAV_PX = 49;

const Icon = ({ tab }: { tab: Tab }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {tab === "foryou" ? <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z" /> : tab === "likes" ? <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" /> : tab === "profile" ? <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6" /></> : <><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.7 14.7L19.5 19.5" /></>}
  </svg>
);

/** Slim bottom bar (white, thin grey line on top). Active tab black, inactive grey (colour fades); a short black indicator glides over the line to the active tab; a pressed tab springs to 0.94. Switching only toggles visibility; nothing is recorded. Tapping Search while in Search is passed on too (the configurator reopens). */
function BottomNav({ tab, onTab, searchOn, glass = false }: { tab: Tab; onTab: (t: Tab) => void; searchOn: boolean; glass?: false | "colorful" | "simple" }) {
  const reduced = useReducedMotion();
  return (
    <nav aria-label="Main" className={`fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] ${glass ? "" : "border-t border-neutral-200 bg-white"}`} style={{ height: `calc(${NAV_PX}px + env(safe-area-inset-bottom))` }}>
      {glass && <div aria-hidden className="absolute" style={{ ...glassPieceStyle(glass || "colorful"), left: STRIPE_BG.glass.marginPx, right: STRIPE_BG.glass.marginPx, top: 2, bottom: "calc(env(safe-area-inset-bottom) + 2px)" }} />}
      <div className="relative mx-auto flex h-[49px] max-w-md" role="tablist" style={glass ? { paddingInline: STRIPE_BG.glass.marginPx + STRIPE_BG.glass.capsulePadPx } : undefined}>
        {navTabs(searchOn).map((t) => (
          <m.button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => (tab !== t || t === "search") && onTab(t)}
            {...pressProps(reduced, MENU.pressScale)} initial={false} animate={{ color: tab === t ? (glass ? STRIPE_BG.glass.textOn : MENU_COLORS.nav.on) : (glass ? STRIPE_BG.glass.textOff : MENU_COLORS.nav.off) }} transition={stateTransition(reduced)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium">
            {tab === t && (reduced
              ? <m.span aria-hidden className="absolute -top-px left-1/2 -ml-4 h-0.5 w-8 rounded-full bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: sec(DURATION_MS.reducedFade) }} />
              : <m.span aria-hidden layoutId="nav-indicator" className="absolute -top-px left-1/2 -ml-4 h-0.5 w-8 rounded-full bg-black" transition={SPRING.pill} />)}
            <Icon tab={t} />{TAB_LABELS[t]}
          </m.button>
        ))}
      </div>
    </nav>
  );
}
export default memo(BottomNav);
