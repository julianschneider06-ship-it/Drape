// What a like (or unlike) tells the taste. One rule for every place a product can be liked (For You, Search, either direction):
// with an outfit context the signal carries the outfit's pieces and tags; without one (Search results of the other direction, where the rest of the
// outfit is arbitrary) it carries the product alone, and the taste learns from the product's own attributes (the same applyEvent as everywhere).
import type { Signal } from "@/outfits/taste-codec";

export type Dir = "women" | "men";
export interface LikeContext { ids: number[]; tg: Signal["tg"]; og?: Dir }

/** the signal of a like / unlike and the direction whose taste it belongs to (null = the feed's own direction) */
export function likeSignal(want: boolean, productId: number, ctx: LikeContext | null): { signal: Signal; dir: Dir | null } {
  const t = want ? "like" : "unlike";
  if (ctx?.og) return { signal: { t, p: productId }, dir: ctx.og };
  return { signal: ctx ? { t, p: productId, o: ctx.ids, tg: ctx.tg } : { t, p: productId }, dir: null };
}
