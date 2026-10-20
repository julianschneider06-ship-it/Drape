"use client";

export default function Heart({ on, onClick, size = 20, label }: { on: boolean; onClick: (e: React.MouseEvent) => void; size?: number; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on}
      className="flex items-center justify-center rounded-full bg-white/80 p-1.5 text-black active:scale-90 transition-transform">
      <svg width={size} height={size} viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7C19.5 15.9 12 20.5 12 20.5z" />
      </svg>
    </button>
  );
}
