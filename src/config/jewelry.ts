// Display scale of jewelry inside outfit cards (display only: no change to selection, feed or data).
// Factor = multiplier on the piece's normal rendered size, applied in the layout (src/lib/layout/rules.ts), so the tap area, like state,
// sale marker and shine strokes follow the scaled rectangle. Keyed by accessory type; unlisted types (shoes, bags, earrings, ...) stay 1.
// "chain" is not a stored type (chains are classified as necklace) but is mapped here too, as an alias.
export const JEWELRY_SCALE: Record<string, number> = {
  watch: 1.10,
  ring: 1.50,
  necklace: 1.25,
  chain: 1.25,
  bracelet: 1.00,   // unchanged for now; change here later
};
export const jewelryScale = (type: string): number => JEWELRY_SCALE[type] ?? 1;
