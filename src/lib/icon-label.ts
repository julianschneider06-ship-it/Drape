// Icon label state (pure + a tiny shared store). Only one label at a time, in the whole app: tap shows it, a tap on another icon replaces it,
// a tap on the same icon hides it, it hides itself after ICON_LABEL_MS, and any other interaction (scroll, swipe, piece tap, sheet) hides it at once.
import { ICON_LABEL_MS } from "@/config/icon-labels";

export type LabelKey = string | null;   // `${outfitKey}:${iconId}`
export type LabelAction = { type: "tap"; key: string } | { type: "hide" } | { type: "expire"; key: string };

export function labelReduce(s: LabelKey, a: LabelAction): LabelKey {
  if (a.type === "tap") return s === a.key ? null : a.key;
  if (a.type === "expire") return s === a.key ? null : s;
  return null;
}

type Timers = { set: (f: () => void, ms: number) => unknown; clear: (h: unknown) => void };
export function createLabelStore(timers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }, ms = ICON_LABEL_MS) {
  let state: LabelKey = null, handle: unknown = null;
  const subs = new Set<() => void>();
  const send = (a: LabelAction) => {
    const next = labelReduce(state, a); if (next === state && a.type !== "tap") return;
    state = next;
    if (handle != null) { timers.clear(handle); handle = null; }
    if (state) { const k = state; handle = timers.set(() => { handle = null; send({ type: "expire", key: k }); }, ms); }
    subs.forEach((f) => f());
  };
  return {
    get: () => state, dispatch: send,
    subscribe: (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export const labelStore = createLabelStore();
