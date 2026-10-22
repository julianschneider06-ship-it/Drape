"use client";
import { useEffect, useRef, useState } from "react";
import * as m from "motion/react-m";
import { MENU } from "@/config/motion";
import { useReducedMotion } from "@/lib/motion";
import { fadeSlide } from "@/lib/menu-motion";
import Heart from "@/components/Heart";
import type { FeedCard } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { formatPrice } from "@/lib/client/format";
import FeedImage from "@/components/FeedImage";
import { track } from "@/lib/client/track";
import { WISHLIST_HEART } from "@/config/wishlist";
import { heartLook, heartVisual, refreshItems } from "@/lib/wishlist-soft";

/** Minimal "Wishlist" products list (the full "My collection" comes later): products this anonymous device liked. Used by the Wishlist tab and by the /likes page. */
export default function LikesView({ liked, onToggle }: { liked?: Set<number>; onToggle?: (card: FeedCard) => void }) {
  const reduced = useReducedMotion();
  const [items, setItems] = useState<FeedCard[] | null>(null);
  const [error, setError] = useState(false);
  const [device, setDevice] = useState("");
  const [local, setLocal] = useState<Set<number>>(new Set());   // standalone (/likes page): the likes of this visit; in the Wishlist tab the feed's set is used
  const likedRef = useRef(liked); likedRef.current = liked;

  useEffect(() => {
    const d = getDeviceId();
    setDevice(d);
    fetch(`/api/likes?device=${d}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: { items: { product: FeedCard }[] }) => { const all = j.items.map((i) => i.product); setItems(likedRef.current ? refreshItems(all, likedRef.current) : all); if (!likedRef.current) setLocal(new Set(all.map((c) => c.id))); })
      .catch(() => setError(true));
  }, []);

  const isLiked = (id: number) => (liked ?? local).has(id);
  // soft unlike: the product stays listed (white heart) and can be liked again; the list only refreshes when the Wishlist is entered again
  const toggle = (c: FeedCard) => {
    if (onToggle) return onToggle(c);   // the feed's normal like path (taste signal, event row, sync everywhere)
    const want = !local.has(c.id);
    setLocal((prev) => { const n = new Set(prev); if (want) n.add(c.id); else n.delete(c.id); return n; });
    fetch("/api/likes", { method: "POST", body: JSON.stringify({ device_id: device, product_id: c.id, liked: want, slot: "sheet" }) }).catch(() => setError(true));
  };

  return (
    <>
      {error && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="py-10 text-center text-sm text-neutral-500">Could not load your wishlist.</m.p>}
      {items && items.length === 0 && <m.p {...fadeSlide(reduced, MENU.hintShiftPx)} className="py-16 text-center text-sm text-neutral-500">Nothing liked yet. Tap the heart on a piece you like.</m.p>}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 lg:grid-cols-6">
        {(items ?? []).map((c) => (
          <li key={c.id} className="relative">
            <div className="relative aspect-[3/4] bg-white"><FeedImage card={c} fill={0.96} minW={500} /></div>
            <div className="absolute right-0 top-0"><Heart on={isLiked(c.id)} look={heartVisual(heartLook(c.id, liked ?? local), WISHLIST_HEART)} onClick={() => toggle(c)} label={isLiked(c.id) ? "Remove like" : "Like"} size={WISHLIST_HEART.size} /></div>
            <p className="mt-1 truncate text-xs font-semibold uppercase tracking-wide">{c.brand}</p>
            <p className="line-clamp-2 text-sm text-neutral-600">{c.name}</p>
            <p className="mt-0.5 text-sm">{formatPrice(c.price_cents, c.currency)}</p>
            <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={() => track({ event_type: "view_product_click", product_id: c.id, slot: "sheet" })}
              className="mt-1 inline-block text-xs underline underline-offset-2">View product</a>
          </li>
        ))}
      </ul>
    </>
  );
}
