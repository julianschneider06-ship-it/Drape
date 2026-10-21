// Swap a piece by swiping sideways: a loop of three (the original + the 2 alternatives delivered with the outfit). In-session state only.
import type { FeedAccessory, FeedAlt, FeedOutfit } from "@/lib/types";

export type Alt = FeedAlt;
/** dir = direction the content moves on screen (animation); move = the user's loop direction (next = swipe right) */
export interface SwapEvt { slot: string; dir: "next" | "prev"; seq: number; kind: "swap"; newId?: number }
/** per outfit and slot key (top | bottom | shoes | acc1..3): position in the loop, 0 = the original, 1 / 2 = alternatives */
export type SwapState = Record<number, Record<string, number>>;

const HEAD = new Set(["cap", "hat", "beanie"]);
/** Placement of an accessory of another type than the one it replaces (same rules as the pool builder, without the outfit context). */
export function placementForSwap(type: string, frontFlat: boolean | null, beltShape: string | null, full: boolean): { placement: "head" | "inline" | "side"; zone: string } {
  if (HEAD.has(type)) return { placement: "side", zone: "head" };
  if (type === "sunglasses") return { placement: "side", zone: "upper" };
  if (type === "necklace") return !!frontFlat && !full ? { placement: "inline", zone: "neck" } : { placement: "side", zone: "mid" };
  if (type === "belt") return !!frontFlat && beltShape === "straight_strip" && !full ? { placement: "inline", zone: "seam" } : { placement: "side", zone: "hip" };
  if (type === "watch" || type === "bracelet") return { placement: "side", zone: "sleeve" };
  if (type === "scarf" || type === "gloves" || type === "tie") return { placement: "side", zone: "upper" };
  if (type === "bag" || type === "backpack") return { placement: "side", zone: "hip" };
  return { placement: "side", zone: "mid" };
}

export const slotKeyOf = (slot: string) => (slot === "full" ? "top" : slot);
/** the loop of one piece: positions 0..alts.length */
export const loopSize = (o: FeedOutfit, key: string) => (o.alts?.[key]?.length ?? 0) + 1;

/** The outfit as the user sees it after their swaps (pieces replaced, layout inputs follow from the cards). */
export function applySwaps(o: FeedOutfit, sw: Record<string, number> | undefined): FeedOutfit {
  if (!sw || !o.alts) return o;
  const pick = (key: string) => { const pos = sw[key]; return pos && pos > 0 ? o.alts?.[key]?.[pos - 1] ?? null : null; };
  const t = pick("top"), b = pick("bottom"), s = pick("shoes");
  const accessories = (o.accessories ?? []).map((a, i): FeedAccessory => {
    const alt = pick(`acc${a.slot_no ?? i + 1}`);
    if (!alt) return a;
    const m = alt.meta, type = m?.type ?? a.type;
    const pl = type === a.type ? { placement: a.placement, zone: a.zone } : placementForSwap(type, m?.front_flat ?? null, m?.belt_shape ?? null, o.kind === "full");
    return { card: alt.card, type, size: m?.size ?? a.size, front_flat: m?.front_flat ?? a.front_flat, belt_shape: m?.belt_shape ?? null, placement: pl.placement, zone: pl.zone, slot_no: a.slot_no };
  });
  return { ...o, top: t?.card ?? o.top, bottom: b ? b.card : o.bottom, shoes: s?.card ?? o.shoes, accessories };
}
