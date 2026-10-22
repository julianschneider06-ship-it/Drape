// Safe area of an outfit card (display only). Every piece's VISIBLE bounds (scaled jewelry and the Search price tag included) must lie inside
// [top, canvas height - bottom] and [left, canvas width - right]. If a composition is taller, the whole composition is scaled down uniformly (src/lib/layout/safe-fit.ts),
// so proportions, the side-by-side centre line + 15% offset, JEWELRY_SCALE ratios and the non-overlap rules all stay intact.
// The canvas itself already ends above the bottom bar (Feed / Wishlist) or above the 60 px Highlight strip (Search); the card sits under the fixed header.
export const LAYOUT_SAFE_MARGIN = {
  top: 22,      // px below the top edge of the canvas (header / notch clearance; the canvas is about 4 px taller than its slot, so the net gap is about 18 px)
  bottom: 22,   // px above the bottom edge of the canvas (bottom bar / Highlight strip)
  left: 16,     // px from the left screen edge
  right: 16,    // px from the right edge of the canvas = the screen edge (Search, Wishlist) or the action rail (feed, the canvas already ends 48 px before the screen edge)
};
