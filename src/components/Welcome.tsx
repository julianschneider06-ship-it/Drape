"use client";
import { useState } from "react";
import { ALL_STYLES, MAX_STYLES, styleLabel } from "@/lib/welcome";

/** First-visit welcome flow (screen 1: gender, screen 2: styles). Nothing is recorded. Only transform / opacity animate. */
export default function Welcome({ onDone }: { onDone: (gender: "men" | "women", styles: string[]) => void }) {
  const [screen, setScreen] = useState<1 | 2>(1);
  const [gender, setGender] = useState<"men" | "women" | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [hint, setHint] = useState(false);
  const hintTimer = useState<{ t?: ReturnType<typeof setTimeout> }>(() => ({}))[0];

  const toggle = (k: string) => {
    if (picked.includes(k)) { setPicked(picked.filter((x) => x !== k)); return; }
    if (picked.length >= MAX_STYLES) { setHint(true); clearTimeout(hintTimer.t); hintTimer.t = setTimeout(() => setHint(false), 1800); return; }
    setPicked([...picked, k]);
  };
  const screenCls = (on: boolean, from: "l" | "r") => `absolute inset-0 flex flex-col bg-white transition-[opacity,transform] duration-300 ease-out ${on ? "opacity-100 translate-x-0" : `pointer-events-none opacity-0 ${from === "l" ? "-translate-x-6" : "translate-x-6"}`}`;

  return (
    <div className="fixed inset-0 z-40 bg-white">
      <section className={screenCls(screen === 1, "l")} aria-hidden={screen !== 1}>
        <div className="flex flex-1 flex-col justify-center px-6">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">Welcome to your own personalized fashion feed.</h1>
          <p className="mt-3 text-lg text-neutral-500">Ready to step up your game?</p>
          <p className="mt-12 text-base font-medium">What are you most interested in?</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {(["men", "women"] as const).map((g) => (
              <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}
                className={`h-28 rounded-2xl border text-xl font-medium active:scale-[0.98] ${gender === g ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-900"}`}>{g === "men" ? "Men" : "Women"}</button>
            ))}
          </div>
        </div>
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <button type="button" disabled={!gender} onClick={() => setScreen(2)}
            className={`h-12 w-full rounded-full text-base font-medium transition-opacity ${gender ? "bg-black text-white" : "bg-neutral-200 text-neutral-400"}`}>Continue</button>
        </div>
      </section>

      <section className={screenCls(screen === 2, "r")} aria-hidden={screen !== 2}>
        <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" onClick={() => setScreen(1)} className="-ml-2 px-2 py-1 text-sm text-neutral-500">‹ Back</button>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Pick up to 5 styles you like.</h2>
          <p className="mt-1 h-5 text-sm text-neutral-500 transition-opacity" style={{ opacity: hint ? 1 : 0.6 }}>{hint ? "That's 5. Tap one to remove it first." : `${picked.length} of ${MAX_STYLES} picked`}</p>
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-y-contain px-6 pb-28 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {ALL_STYLES.map((k) => {
              const on = picked.includes(k);
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggle(k)}
                  className={`h-12 rounded-full border text-[15px] active:scale-[0.97] ${on ? "border-black bg-black text-white" : "border-neutral-300 text-neutral-900"}`}>{styleLabel(k)}</button>
              );
            })}
          </div>
        </div>
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-white via-white to-transparent px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 transition-opacity duration-200 ${picked.length ? "opacity-100" : "opacity-0"}`}>
          <button type="button" tabIndex={picked.length ? 0 : -1} onClick={() => gender && picked.length && onDone(gender, picked)}
            className={`h-12 rounded-full bg-black px-8 text-base font-medium text-white active:scale-95 ${picked.length ? "pointer-events-auto" : ""}`}>Let&apos;s get started</button>
        </div>
      </section>
    </div>
  );
}
