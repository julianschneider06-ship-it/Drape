"use client";
import { useState } from "react";
import type { FeedCard, FeedOutfit } from "@/lib/types";
import type { SlotName } from "@/lib/layout/engine";
import LikesView from "./LikesView";
import GenerateOutfits from "./GenerateOutfits";

export type WishTab = "products" | "outfits";
const TABS: { id: WishTab; label: string }[] = [{ id: "products", label: "Products" }, { id: "outfits", label: "Generate Outfits" }];

/** The Wishlist tab: title, a Products | Generate Outfits switcher, and the chosen view below (the bottom bar stays visible). */
export default function WishlistView({ gender, liked, tab, onTab, onUnlike, onOpen, onLike }: {
  gender: "women" | "men"; liked: Set<number>; tab: WishTab; onTab: (t: WishTab) => void; onUnlike: (id: number) => void;
  onOpen: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => void; onLike: (card: FeedCard, outfit: FeedOutfit, index: number, slot: SlotName) => boolean;
}) {
  const [shuffle, setShuffle] = useState(0);
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
        {tab === "products" ? (
          <div className="absolute inset-0 overflow-y-auto px-3 pb-6"><div className="mx-auto max-w-5xl"><LikesView onUnlike={onUnlike} /></div></div>
        ) : (
          <GenerateOutfits gender={gender} likedIds={[...liked]} shuffleKey={shuffle} onOpen={onOpen} onLike={onLike} />
        )}
      </div>
    </div>
  );
}
