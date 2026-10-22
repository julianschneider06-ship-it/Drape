"use client";
import { heartFillTransition } from "@/lib/heart-motion";
import { useHeartMotion } from "@/lib/use-heart-motion";

/** Round heart button (product sheet, Wishlist > Products). Press, pop and colour fade come from src/config/motion.ts. */
export default function Heart({ on, onClick, size = 20, label, look }: { on: boolean; onClick: (e: React.MouseEvent) => void; size?: number; label: string; look?: { fill: string; stroke: string; filter?: string } }) {
  const { ref, bind, reduced } = useHeartMotion(on);
  const none = (v: string) => (v === "none" ? "transparent" : v);
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on} {...bind}
      className="flex items-center justify-center rounded-full bg-white/80 p-1.5 text-black">
      <span ref={ref as React.RefObject<HTMLSpanElement>} className="flex">
        <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth="1.8" strokeLinejoin="round"
          style={{ fill: look ? none(look.fill) : on ? "currentColor" : "transparent", stroke: look ? none(look.stroke) : "currentColor", filter: look?.filter, transition: heartFillTransition(reduced) }}>
          <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" />
        </svg>
      </span>
    </button>
  );
}
