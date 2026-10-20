"use client";
import { useEffect } from "react";
import type { FeedCard } from "@/lib/types";
import { formatPrice } from "@/lib/client/format";
import FeedImage from "./FeedImage";
import Heart from "./Heart";

export default function ProductSheet({ card, liked, onLike, onClose, onViewProduct }: {
  card: FeedCard; liked: boolean; onLike: () => void; onClose: () => void; onViewProduct: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const price = formatPrice(card.price_cents, card.currency);
  const was = card.compare_at_cents && card.compare_at_cents > (card.price_cents ?? 0) ? formatPrice(card.compare_at_cents, card.currency) : null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={`${card.brand} ${card.name}`}>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-300" />
        <div className="relative h-[52dvh] bg-white">
          <FeedImage card={card} fill={0.96} minW={1000} priority />
        </div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider">{card.brand}</p>
            <p className="mt-0.5 text-base leading-snug text-neutral-800">{card.name}</p>
            {price && (
              <p className="mt-1 text-base">
                <span className="font-medium">{price}</span>
                {was && <span className="ml-2 text-sm text-neutral-400 line-through">{was}</span>}
              </p>
            )}
          </div>
          <Heart on={liked} onClick={onLike} size={26} label={liked ? "Remove like" : "Like"} />
        </div>
        <a href={card.url} target="_blank" rel="noopener noreferrer" onClick={onViewProduct}
          className="mt-4 block rounded-full bg-black py-3 text-center text-sm font-medium text-white active:opacity-80">
          View product
        </a>
      </div>
    </div>
  );
}
