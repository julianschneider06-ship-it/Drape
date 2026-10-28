// Outfit preview ("mannequin"): a small child's-drawing figure at the bottom that wears the outfit on screen (display only, nothing stored, no AI).
// It sits in the screen-anchored decoration layer (SeasonDecor), above the bottom bar over the "Wishlist" tab, in front of the meadow and behind the products.
export const MANNEQUIN = {
  heightPx: 92,               // figure height on screen; width follows the drawing's aspect (VIEW.w / VIEW.h)
  bottomGapPx: 6,             // space between the figure's feet and the bar (the safe area is added when the bar is hidden)
  xShiftPx: 0,                // fine-tune: moves the figure sideways from the centre of the Wishlist tab (+ = right)
  barMaxWidthPx: 448,         // the bottom bar is as wide as the screen up to this width (same as `max-w-md` in BottomNav)
  opacity: 1,
  view: { w: 60, h: 114 },    // drawing space (feet at the bottom, hats at the top)
  line: { color: "#2b2b2b", width: 2.4, wobble: 0.5 },   // continuous outline, deterministic wobble (drawing units)
  skin: "#f6dfcc",
  fallbackColor: "#b9bdc4",   // neutral grey: colour missing or not a plain colour (e.g. multicolor)
  defaults: { shoes: "low", bottom: "slim", top: "long", dressHem: "short" } as const,   // used when the data says nothing
} as const;
