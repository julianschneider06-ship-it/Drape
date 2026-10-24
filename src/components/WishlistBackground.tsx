"use client";
import { preload } from "react-dom";
import { WISHLIST_BG } from "@/config/wishlist-background";
import { useDrapeBackground } from "@/lib/client/background";

/** Static background layer: absolute, never inside a scroller, so it never moves with the content. */
export function WishlistBackground({ className = "" }: { className?: string }) {
  const on = useDrapeBackground();
  if (!WISHLIST_BG.enabled || !on) return null;
  preload(WISHLIST_BG.src, { as: "image", fetchPriority: "high" });
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 bg-white ${className}`}
      style={{ backgroundImage: `url(${WISHLIST_BG.src})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }}>
      {WISHLIST_BG.overlayOpacity > 0 && <div className="absolute inset-0 bg-white" style={{ opacity: WISHLIST_BG.overlayOpacity }} />}
    </div>
  );
}
