"use client";
import { useState } from "react";
import * as m from "motion/react-m";
import { AnimatePresence, useIsPresent } from "motion/react";
import { MENU, DURATION_MS, sec } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide, pressProps } from "@/lib/menu-motion";
import Segmented from "./Segmented";
import Layer from "./Layer";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import LikesView from "./LikesView";
import GenerateOutfits from "./GenerateOutfits";

export type WishTab = "products" | "outfits";
const TABS: { id: WishTab; label: string }[] = [{ id: "products", label: "Products" }, { id: "outfits", label: "Generate Outfits" }];

/** The Wishlist tab (fades in over the feed, fades out when left): title, a Products | Generate Outfits switcher, and the chosen view below (the bottom bar stays visible). */
export default function WishlistView({ icons, gender, liked, tab, onTab, onToggle, onOpen, onLike, onOpenProduct, sheetOpen }: {
  icons?: boolean; gender: "women" | "men"; liked: Set<number>; onOpenProduct: (card: FeedCard) => void; sheetOpen: boolean; tab: WishTab; onTab: (t: WishTab) => void; onToggle: (card: FeedCard) => void;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onLike: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => boolean;
}) {
  const reduced = useReducedMotion(), present = useIsPresent();
  const [shuffle, setShuffle] = useState(0);
  const [entryIds] = useState(() => [...liked]);   // likes as of entering the Wishlist: soft-unliked products are only dropped from new batches after the next entry
  return (
    <m.div className={`fixed inset-x-0 top-0 z-30 flex flex-col bg-white ${present ? "" : "pointer-events-none"}`} style={{ bottom: "var(--nav-h)" }}
      initial={{ opacity: 0, y: reduced ? 0 : MENU.tabShiftPx }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 0 }}
      transition={{ duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.tabIn), ease: "easeOut" }}>
      <div className="shrink-0 bg-white px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="relative flex items-center justify-center py-3">
          <h1 className="text-base font-semibold">Wishlist</h1>
          <AnimatePresence>
            {tab === "outfits" && liked.size > 0 && (
              <m.button key="shuffle" type="button" onClick={() => setShuffle((n) => n + 1)} {...pressProps(reduced, MENU.pressScale)}
                {...fadeSlide(reduced, MENU.hintShiftPx)} className="absolute right-0 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">Shuffle</m.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex justify-center">
          <Segmented id="wishlist" label="Wishlist view" options={TABS} value={tab} onChange={onTab} />
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* the products list stays mounted (hidden) so a soft-unliked product keeps its place while switching views */}
        <Layer active={tab === "products"} shiftPx={0} className="absolute inset-0 overflow-y-auto px-3 pb-6"><div className="mx-auto max-w-5xl"><LikesView liked={liked} onToggle={onToggle} onOpenProduct={onOpenProduct} sheetOpen={sheetOpen} /></div></Layer>
        <AnimatePresence>
          {tab === "outfits" && (
            <m.div key="outfits" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: sec(reduced ? DURATION_MS.reducedFade : DURATION_MS.tabIn) }}>
              <GenerateOutfits icons={icons} gender={gender} likedIds={entryIds} liked={liked} shuffleKey={shuffle} onOpen={onOpen} onLike={onLike} />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  );
}
