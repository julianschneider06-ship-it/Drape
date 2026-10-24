// My Outfits editor layout (pure): the SAME rule layout as the outfit cards (computeLayout), fed with the chosen pieces and placeholders for the empty slots,
// so every slot sits where its piece will sit in the normal view. Accessory slots are placeholders of fixed types (src/config/my-outfits.ts).
import { MY_OUTFITS_ACC_PLACEHOLDERS, MY_OUTFITS_ACC_SLOTS } from "@/config/my-outfits";
import { garmentClass, type GarmentClass } from "@/lib/layout/config";
import { computeLayout, type AccIn, type AccSlot, type Layout, type PieceIn, type SlotName } from "@/lib/layout/engine";
import { cropGeometry } from "@/lib/client/format";
import { isOnePiece, type SlotRef } from "@/lib/my-outfits";
import type { FeedCard } from "@/lib/types";

export interface EditorCards { top?: FeedCard; bottom?: FeedCard; shoes?: FeedCard }

const pieceIn = (slot: "top" | "bottom" | "shoes" | "full", c: FeedCard | undefined): PieceIn => {
  if (!c) return { slot, cls: (slot === "bottom" ? "trousers" : slot) as GarmentClass, aspect: null };
  const g = cropGeometry(c);
  return { slot, cls: garmentClass(slot, c.name), aspect: g ? g.cw / g.ch : null, presentation: c.presentation ?? null, hem: c.hem ?? null, waist: c.waist ?? null, collar: c.collar ?? null, hood: c.hood ?? null, fill: c.fill ?? null };
};

/** layout of the editor canvas for the current picks (cards already `viewCard`-ed); a one-piece Top switches to the full-body layout like the normal view */
export function editorLayout(cards: EditorCards, canvas: { w: number; h: number }, accSlots = MY_OUTFITS_ACC_SLOTS): Layout {
  const full = isOnePiece(cards.top);
  const pieces: Partial<Record<SlotName, PieceIn>> = full
    ? { full: pieceIn("full", cards.top), shoes: pieceIn("shoes", cards.shoes) }
    : { top: pieceIn("top", cards.top), bottom: pieceIn("bottom", cards.bottom), shoes: pieceIn("shoes", cards.shoes) };
  const accessories: AccIn[] = Array.from({ length: accSlots }, (_, i) => {
    const p = MY_OUTFITS_ACC_PLACEHOLDERS[i % MY_OUTFITS_ACC_PLACEHOLDERS.length];
    return { slot: `acc${i + 1}` as AccSlot, type: p.type, size: "medium", aspect: 1, placement: "side", zone: p.zone, frontFlat: false, beltShape: null };
  });
  return computeLayout({ kind: full ? "full" : "three", pieces, seed: 1, canvas, accessories });
}

/** which editor slot a laid-out piece stands for */
export const slotRefOf = (slot: SlotName): SlotRef => (slot === "top" || slot === "full" ? "top" : slot === "bottom" || slot === "shoes" ? slot : { acc: Number(slot.slice(3)) - 1 });

/** accessory slot indexes that the layout did not place (no room, e.g. in the full-body layout) plus slots beyond MY_OUTFITS_ACC_SLOTS: the editor lists the filled ones below the layout so nothing is hidden */
export function unplacedAcc(layout: Layout, accLength: number): number[] {
  const placed = new Set(layout.pieces.filter((p) => p.slot.startsWith("acc")).map((p) => Number(p.slot.slice(3)) - 1));
  return Array.from({ length: accLength }, (_, i) => i).filter((i) => !placed.has(i));
}
