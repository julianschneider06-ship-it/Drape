"use client";
import { useEffect, useMemo, useState, type RefObject } from "react";
import SeasonDecor from "./SeasonDecor";
import StripeBackground from "./StripeBackground";
import { WishlistBackground } from "./WishlistBackground";
import { LAYER_Z } from "@/config/season-decor";
import { dominantSeason } from "@/lib/season-decor";
import { outfitStripePalette } from "@/lib/stripe-bg";
import { mannequinSpec, type MannequinSpec } from "@/lib/mannequin";
import { railIndex } from "@/lib/rail-state";
import { viewHeight } from "@/lib/view-height";
import { useSeasonDecor } from "@/lib/client/season-decor";
import { useMiniPreview } from "@/lib/client/mannequin";
import { useStripeMode } from "@/lib/client/stripe-bg";
import type { FeedOutfit } from "@/lib/types";

/** Outfit the snap scroller shows right now (nearest snap position; changes once at the halfway point of a swipe, no render per frame). */
function useNearestIndex(scroller: RefObject<HTMLElement | null>, count: number): number {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    let raf = 0;
    const sync = () => { raf = 0; setIdx(railIndex(el.scrollTop, viewHeight(el), count)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(sync); };
    el.addEventListener("scroll", on, { passive: true }); sync();
    return () => { el.removeEventListener("scroll", on); if (raf) cancelAnimationFrame(raf); };
  }, [scroller, count]);
  return Math.min(idx, Math.max(0, count - 1));
}

/** Background of Wishlist > Generate Outfits and My Outfits, the same pieces as the For You feed: Stripe background (Off | Colorful | Simple), seasonal decoration, outfit preview figure.
 *  `outfits[i]` = the outfit as shown in section i (null = nothing to show, e.g. a saved outfit that is not drawn yet). Everything follows the parts as shown (greyed ones count).
 *  PRECEDENCE: Stripe Colorful / Simple replaces the "Drape Background" image (not drawn then); Stripe Off keeps it as before. The stage = Wishlist header block .. tab bar. */
export default function WishlistBackdrop({ scroller, outfits, gender, searchOn }: { scroller: RefObject<HTMLElement | null>; outfits: (FeedOutfit | null)[]; gender: "women" | "men"; searchOn: boolean }) {
  const seasonOn = useSeasonDecor(), miniOn = useMiniPreview(), stripeMode = useStripeMode();
  const idx = useNearestIndex(scroller, outfits.length);
  const seasons = useMemo(() => outfits.map((o) => (o ? dominantSeason(o.tags) : null)), [outfits]);
  const minis = useMemo(() => (miniOn ? { specs: outfits.map((o) => (o && o.top.id > 0 ? mannequinSpec(o, gender) : undefined) as MannequinSpec), searchOn } : null), [miniOn, outfits, searchOn, gender]);
  const cur = outfits[idx] ?? null;
  const colors = useMemo(() => (stripeMode === "colorful" && cur ? outfitStripePalette(cur) : []), [stripeMode, cur]);
  return (
    <>
      {stripeMode === "off" ? <WishlistBackground /> : <StripeBackground mode={stripeMode} colors={colors} seed={String(cur?.id ?? "")} className="fixed inset-0" style={{ zIndex: LAYER_Z.stripe }} />}
      {(seasonOn || miniOn) && <SeasonDecor scroller={scroller} seasons={seasonOn ? seasons : null} minis={minis} className="absolute inset-0" stageBars stageSource="wishlist" />}
    </>
  );
}
