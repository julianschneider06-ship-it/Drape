/** Which outfit the fixed action rail belongs to: the one whose card covers most of the viewport, i.e. the nearest snap position.
 *  While scrolling between two outfits the answer flips once, at the halfway point (no flicker, no stale state). */
export function railIndex(scrollTop: number, sectionH: number, count: number): number {
  if (!count || !(sectionH > 0)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / sectionH)));
}
