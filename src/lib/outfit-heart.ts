import type { FeedCard, FeedOutfit } from "@/lib/types";

/** The products of an outfit card as shown: top (or dress), bottom, shoes and the accessories that were placed. `slots` = the slots the layout placed (undefined = not known yet: all pieces with a cutout). */
export function outfitPieces(o: FeedOutfit, slots?: readonly string[]): FeedCard[] {
  const want = (s: string) => !slots || slots.includes(s);
  const out: FeedCard[] = [];
  if (want(o.kind === "full" ? "full" : "top")) out.push(o.top);
  if (o.bottom && want("bottom")) out.push(o.bottom);
  if (want("shoes")) out.push(o.shoes);
  (o.accessories ?? []).slice(0, 8).forEach((a, i) => { if (a.card && a.card.cutout && want(`acc${a.slot_no ?? i + 1}`)) out.push(a.card); });
  return out.filter((c, i) => out.findIndex((x) => x.id === c.id) === i);
}

export type HeartState = "all" | "partly" | "none";
export const heartState = (ids: readonly number[], liked: ReadonlySet<number>): HeartState => {
  const n = ids.filter((id) => liked.has(id)).length;
  return ids.length && n === ids.length ? "all" : n ? "partly" : "none";
};

/** What a tap does: everything liked -> unlike all; otherwise like the missing ones (already liked stay liked). Returns the ids to toggle. */
export const heartToggle = (ids: readonly number[], liked: ReadonlySet<number>): { want: boolean; ids: number[] } =>
  heartState(ids, liked) === "all" ? { want: false, ids: [...ids] } : { want: true, ids: ids.filter((id) => !liked.has(id)) };
