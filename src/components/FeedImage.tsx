"use client";
import { useState } from "react";
import type { FeedCard } from "@/lib/types";
import { blendStyle, cropGeometry, feedSrc } from "@/lib/client/format";

/**
 * Product image fitted to its box, cropped to the product's content box (shop whitespace removed) when known,
 * with the backdrop blended into white. The parent must have a fixed size (it becomes a size container).
 */
export default function FeedImage({ card, tall, priority, fill = 0.92, minW }: { card: FeedCard; tall?: boolean; priority?: boolean; fill?: number; minW?: number }) {
  const [failed, setFailed] = useState(false);
  const g = cropGeometry(card);
  if (failed) return <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-neutral-400">{card.brand}<br />{card.name}</span>;
  const src = feedSrc(card, tall, minW);
  if (!g) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-contain p-1.5" style={blendStyle(card)} draggable={false} />;
  }
  const k = `min(${(fill * 100) / g.cw}cqw, ${(fill * 100) / g.ch}cqh)`;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ containerType: "size" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} draggable={false}
        style={{
          position: "absolute", maxWidth: "none", ["--k" as string]: k, height: "var(--k)", width: `calc(var(--k) * ${g.A})`,
          left: `calc(50cqw - var(--k) * ${g.cx})`, top: `calc(50cqh - var(--k) * ${g.cy})`, ...blendStyle(card),
        }} />
    </div>
  );
}
