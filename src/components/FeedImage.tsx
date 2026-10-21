"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { FeedCard } from "@/lib/types";
import { blendStyle, cropGeometry, imgUrl } from "@/lib/client/format";
import { isOnSale, saleMarkerOn, saleSize, SaleJoinFilter } from "@/lib/client/sale";
import { pairGap } from "@/lib/client/pair";

/**
 * Product image fitted to its box, cropped to the product's content box (shop whitespace removed) when known,
 * with the backdrop blended into white. The parent must have a fixed size (it becomes a size container).
 */
export default function FeedImage({ card, src: srcIn, priority, fill = 0.92, minW = 700, blend = true, wShare = 0.3 }: { card: FeedCard; src?: string; blend?: boolean; priority?: boolean; fill?: number; minW?: number; wShare?: number }) {
  const [failed, setFailed] = useState(false);
  const g = cropGeometry(card);
  const sale = !blend && saleMarkerOn() && isOnSale(card);   // only cutouts (transparent) get the outline
  // a pair (two separate shapes in one cutout) gets ONE common outline: the gap between the shapes is closed before the outline is drawn
  const [join, setJoin] = useState<number | null>(null), ref = useRef<HTMLImageElement>(null), fid = useId().replace(/:/g, "");
  const srcNow = srcIn ?? imgUrl(card.image, minW);
  useEffect(() => {
    if (!sale) return; let off = false;
    pairGap(srcNow).then((gap) => { if (off || gap == null) return; const w = ref.current?.getBoundingClientRect().width ?? 0; if (w > 0) setJoin(Math.min(28, Math.ceil(gap * w * 0.8 + 2))); });
    return () => { off = true; };
  }, [sale, srcNow]);
  const look = blend ? blendStyle(card) : sale ? { filter: `url(#${join ? `drape-sale-join-${fid}` : `drape-sale-ink-${saleSize(wShare)}`})` } : undefined; // cutouts are transparent: no multiply (shoes stay opaque over trousers)
  if (failed) return <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-neutral-400">{card.brand}<br />{card.name}</span>;
  const src = srcIn ?? imgUrl(card.image, minW);
  if (!g) {
    // eslint-disable-next-line @next/next/no-img-element
    return <><img ref={ref} src={src} alt="" referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)}
      className="absolute inset-0 h-full w-full object-contain p-1.5" style={look} draggable={false} />{join ? <SaleJoinFilter id={`drape-sale-join-${fid}`} size={saleSize(wShare)} close={join} /> : null}</>;
  }
  const k = `min(${(fill * 100) / g.cw}cqw, ${(fill * 100) / g.ch}cqh)`;
  return (
    <div className={`absolute inset-0 ${sale ? "" : "overflow-hidden"}`} style={{ containerType: "size" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {join ? <SaleJoinFilter id={`drape-sale-join-${fid}`} size={saleSize(wShare)} close={join} /> : null}
      <img ref={ref} src={src} alt="" referrerPolicy="no-referrer" loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} draggable={false}
        style={{
          position: "absolute", maxWidth: "none", ["--k" as string]: k, height: "var(--k)", width: `calc(var(--k) * ${g.A})`,
          left: `calc(50cqw - var(--k) * ${g.cx})`, top: `calc(50cqh - var(--k) * ${g.cy})`, ...look,
        }} />
    </div>
  );
}
