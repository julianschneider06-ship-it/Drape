// Swap a piece by swiping sideways: in-session state only (resets on reload). Alternatives come precomputed from /api/alternatives.
import type { FeedAccessory, FeedCard, FeedOutfit } from "@/lib/types";

export interface Alt { rank: number; card: FeedCard; meta?: { type: string | null; size: string | null; front_flat: boolean | null; belt_shape: string | null } | null }
export interface SwapEvt { slot: string; dir: "next" | "prev"; seq: number; kind: "swap" | "bounce"; newId?: number }
/** per outfit and slot key (top | bottom | shoes | acc1..3): index into the alternatives list, -1 = the original piece */
export type SwapState = Record<number, Record<string, number>>;
export type AltLists = Record<string, Alt[]>;   // key `${outfitId}:${slotKey}`

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

/** The outfit as the user sees it after their swaps (pieces replaced, layout inputs follow from the cards). */
export function applySwaps(o: FeedOutfit, sw: Record<string, number> | undefined, lists: AltLists): FeedOutfit {
  if (!sw) return o;
  const pick = (key: string): Alt | null => { const i = sw[key]; return i !== undefined && i >= 0 ? lists[`${o.id}:${key}`]?.[i] ?? null : null; };
  const t = pick("top"), b = pick("bottom"), s = pick("shoes");
  const accessories = (o.accessories ?? []).map((a, i): FeedAccessory => {
    const alt = pick(`acc${i + 1}`);
    if (!alt) return a;
    const m = alt.meta, type = m?.type ?? a.type;
    const pl = type === a.type ? { placement: a.placement, zone: a.zone } : placementForSwap(type, m?.front_flat ?? null, m?.belt_shape ?? null, o.kind === "full");
    return { card: alt.card, type, size: m?.size ?? a.size, front_flat: m?.front_flat ?? a.front_flat, belt_shape: m?.belt_shape ?? null, placement: pl.placement, zone: pl.zone };
  });
  return { ...o, top: t?.card ?? o.top, bottom: b ? b.card : o.bottom, shoes: s?.card ?? o.shoes, accessories };
}
