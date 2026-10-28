// Outfit preview ("mannequin"): a small pixel-art figure at the bottom that wears the outfit's colours (display only, nothing stored, no AI).
// It sits in the screen-anchored decoration layer (SeasonDecor), above the bottom bar over the "Wishlist" tab, in front of the meadow and behind the products.
// The figure itself (grid, ops, colour rules, pose) lives in src/config/pixel-figure.ts.
import { PIXEL_GRID } from "@/config/pixel-figure";

export const MANNEQUIN = {
  heightPx: 92,               // figure height on screen; width follows the grid's aspect (20:40)
  bottomGapPx: 6,             // space between the figure's feet and the bar (the safe area is added when the bar is hidden)
  xShiftPx: 0,                // fine-tune: moves the figure sideways from the centre of the Wishlist tab (+ = right)
  barMaxWidthPx: 448,         // the bottom bar is as wide as the screen up to this width (same as `max-w-md` in BottomNav)
  opacity: 1,
  view: PIXEL_GRID,           // drawing space = pixel grid
  fallbackColor: "#b9bdc4",   // headwear / bag whose colour is missing or not a plain colour (e.g. multicolor)
} as const;
