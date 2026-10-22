import type { WISHLIST_HEART } from "@/config/wishlist";

/** Soft unlike (Wishlist > Products): an unliked product stays listed, with a white heart, until the Wishlist is entered again. Pure logic, no state. */
export type HeartLook = "black" | "white";

/** Heart colour of a listed product: black while it is liked, white after a soft unlike. */
export const heartLook = (id: number, liked: ReadonlySet<number>): HeartLook => (liked.has(id) ? "black" : "white");

/** Entering the Wishlist again: the fresh list from the server (liked products only) replaces the old one, so soft-unliked products drop out. */
export const refreshItems = <T extends { id: number }>(fresh: readonly T[], liked: ReadonlySet<number>): T[] => fresh.filter((c) => liked.has(c.id));

/** Visual values of the heart for a look (from src/config/wishlist.ts). */
export function heartVisual(look: HeartLook, cfg: typeof WISHLIST_HEART) {
  return look === "black" ? { fill: cfg.on.fill, stroke: cfg.on.stroke, filter: undefined } : { fill: cfg.off.fill, stroke: cfg.off.stroke, filter: cfg.off.shadow };
}
