// Invisible tap areas of the pieces on outfit cards (display/interaction only: no change to selection, feed or data).
// Each piece's tap area is its visible rectangle plus HIT_PADDING px per side (by category); where two areas would collide the contested
// space is split at the midpoint between the two visible images (src/lib/hit-areas.ts). Like state, sale marker and shine follow the VISIBLE piece.
export type HitCategory = "garment" | "shoes" | "jewelry" | "glasses" | "head" | "bag" | "belt" | "accessory";

export const HIT_PADDING: Record<HitCategory, number> = {
  garment: 4,     // top, bottom, full body
  shoes: 4,
  jewelry: 14,    // watch, ring, bracelet, necklace, chain, earrings
  glasses: 14,    // sunglasses
  head: 14,       // hat, cap, beanie
  bag: 14,
  belt: 14,
  accessory: 14,  // everything else (scarf, tie, gloves, other_wearable, ...)
};

const TYPE_CATEGORY: Record<string, HitCategory> = {
  watch: "jewelry", ring: "jewelry", bracelet: "jewelry", necklace: "jewelry", chain: "jewelry", earrings: "jewelry",
  sunglasses: "glasses", glasses: "glasses",
  hat: "head", cap: "head", beanie: "head",
  bag: "bag", backpack: "bag",
  belt: "belt",
};

/** category of a piece: slot top/bottom/full = garment, shoes = shoes, accessories by their type */
export function hitCategory(slot: string, accType?: string | null): HitCategory {
  if (slot === "shoes") return "shoes";
  if (!slot.startsWith("acc")) return "garment";
  return (accType && TYPE_CATEGORY[accType]) || "accessory";
}

// Zone of the small attribute icons (top left of the card, non-tappable): areas never extend into it. Canvas px; widest case = 5 icons.
export const HIT_ICON_ZONE = { x: 0, y: 0, w: 12 + 5 * 26 + 4 * 4 + 6, h: 26 + 8 };

// ?hit=1 debug colours (fill / outline), one per category
export const HIT_DEBUG_COLORS: Record<HitCategory, string> = {
  garment: "59,130,246", shoes: "34,197,94", jewelry: "236,72,153", glasses: "249,115,22", head: "168,85,247", bag: "234,179,8", belt: "20,184,166", accessory: "239,68,68",
};
