"use client";
import { useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import LikesView from "./LikesView";
import GenerateOutfits from "./GenerateOutfits";

export type WishTab = "products" | "outfits";
const TABS: { id: WishTab; label: string }[] = [{ id: "products", label: "Products" }, { id: "outfits", label: "Generate Outfits" }];

/** The Wishlist tab: title, a Products | Generate Outfits switcher, and the chosen view below (the bottom bar stays visible). */
export default function WishlistView({ gender, liked, tab, onTab, onToggle, onOpen, onLike }: {
  gender: "women" | "men"; liked: Set<number>; tab: WishTab; onTab: (t: WishTab) => void; onToggle: (card: FeedCard) => void;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onLike: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => boolean;
}) {
  const [shuffle, setShuffle] = useState(0);
  const [entryIds] = useState(() => [...liked]);   // likes as of entering the Wishlist: soft-unliked products are only dropped from new batches after the next entry
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex flex-col bg-white" style={{ bottom: "var(--nav-h)" }}>
      <div className="shrink-0 bg-white px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="relative flex items-center justify-center py-3">
          <h1 className="text-base font-semibold">Wishlist</h1>
          {tab === "outfits" && liked.size > 0 && <button type="button" onClick={() => setShuffle((n) => n + 1)} className="absolute right-0 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600 active:bg-neutral-200">Shuffle</button>}
        </div>
        <div className="flex justify-center">
          <div className="flex rounded-full bg-neutral-100 p-0.5 text-sm" role="tablist" aria-label="Wishlist view">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}
                className={`rounded-full px-4 py-1 transition-colors ${tab === t.id ? "bg-black text-white" : "text-neutral-600"}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* the products list stays mounted (hidden) so a soft-unliked product keeps its place while switching views */}
        <div className="absolute inset-0 overflow-y-auto px-3 pb-6" style={{ display: tab === "products" ? undefined : "none" }}><div className="mx-auto max-w-5xl"><LikesView liked={liked} onToggle={onToggle} /></div></div>
        {tab === "outfits" && <GenerateOutfits gender={gender} likedIds={entryIds} shuffleKey={shuffle} onOpen={onOpen} onLike={onLike} />}
      </div>
    </div>
  );
}
