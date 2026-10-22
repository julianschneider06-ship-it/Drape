"use client";
import { useEffect, useState } from "react";
import Heart from "@/components/Heart";
import type { FeedCard } from "@/lib/types";
import { getDeviceId } from "@/lib/client/device";
import { formatPrice } from "@/lib/client/format";
import FeedImage from "@/components/FeedImage";
import { track } from "@/lib/client/track";

/** Minimal "Wishlist" products list (the full "My collection" comes later): products this anonymous device liked. Used by the Wishlist tab and by the /likes page. */
export default function LikesView({ onUnlike }: { onUnlike?: (productId: number) => void }) {
  const [items, setItems] = useState<FeedCard[] | null>(null);
  const [error, setError] = useState(false);
  const [device, setDevice] = useState("");

  useEffect(() => {
    const d = getDeviceId();
    setDevice(d);
    fetch(`/api/likes?device=${d}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j: { items: { product: FeedCard }[] }) => setItems(j.items.map((i) => i.product)))
      .catch(() => setError(true));
  }, []);

  const unlike = (c: FeedCard) => {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    onUnlike?.(c.id);
    fetch("/api/likes", { method: "POST", body: JSON.stringify({ device_id: device, product_id: c.id, liked: false, slot: "sheet" }) }).catch(() => setError(true));
  };

  return (
    <>
      {error && <p className="py-10 text-center text-sm text-neutral-500">Could not load your wishlist.</p>}
      {items && items.length === 0 && <p className="py-16 text-center text-sm text-neutral-500">Nothing liked yet. Tap the heart on a piece you like.</p>}
      <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-4 lg:grid-cols-6">
        {(items ?? []).map((c) => (
          <li key={c.id} className="relative">
            <div className="relative aspect-[3/4] bg-white"><FeedImage card={c} fill={0.96} minW={500} /></div>
            <div className="absolute right-0 top-0"><Heart on onClick={() => unlike(c)} label="Remove like" size={18} /></div>
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
