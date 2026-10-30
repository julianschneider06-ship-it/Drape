/** Visible height of the outfit area of a snap scroller: the height of its first section. Equals clientHeight, except while the glass tab bar is on and the scroller runs down to the
 *  screen edge (then it is taller by the bar height, so outfits show through the bar, and the layout must keep measuring the sections). */
export const viewHeight = (el: HTMLElement): number => (el.firstElementChild as HTMLElement | null)?.offsetHeight || el.clientHeight;
