// Server side of Wishlist > Generate Outfits. Read-only, from the in-memory catalogue snapshot: no database read, no write, no paid call, nothing stored.
// The client sends its liked product ids (they live on the device); only pieces of the chosen direction that are in the catalogue count. Each outfit is anchored on a
// liked main piece (or a liked accessory when there is no liked main piece); the rest is composed by the normal rules (src/outfits/compose-around.ts) with liked
// pieces preferred, the gaps are filled with other catalogue pieces.
import "server-only";
import { getCat, toFeedOutfits } from "@/lib/dynamic";
import { WISHLIST_PAGE } from "@/config/wishlist";
import { anchorSequence, avoidIds, usableLiked } from "@/lib/wishlist-outfits";
import { composeAround, newAround } from "@/outfits/compose-around";
import type { FeedOutfit } from "@/lib/types";

type Gender = "women" | "men";
export interface WishlistPage { items: FeedOutfit[]; usable: number; next: number }

export async function wishlistPage(g: Gender, likedIds: number[], seed: number, from: number, prev: number[], limit = WISHLIST_PAGE): Promise<WishlistPage> {
  const cat = await getCat(g);
  const { mains, accs } = usableLiked(cat, g, likedIds);
  const liked = new Set([...mains, ...accs]);
  if (!liked.size) return { items: [], usable: 0, next: from };
  const accessory = !mains.length, anchors = accessory ? accs : mains;
  const kindOf = (id: number) => cat.byId.get(id)?.slot ?? "acc", perKind = new Map<string, number>();
  for (const id of liked) perKind.set(kindOf(id), (perKind.get(kindOf(id)) ?? 0) + 1);
  const st = newAround(); st.liked = liked; st.avoid = avoidIds(prev, liked, kindOf, perKind);
  const seq = anchorSequence(anchors, seed, from + limit * 3), made: { o: NonNullable<ReturnType<typeof composeAround>>; i: number }[] = [];
  let i = from;
  for (; i < seq.length && made.length < limit; i++) {
    const a = seq[i];
    if (anchors.length > 1 && st.avoid.has(a)) continue;   // the anchor was in the previous outfit
    const salt = (seed % 9973) + i * 13;
    const o = composeAround(cat, g, a, accessory, st, salt) ?? composeAround(cat, g, a, accessory, st, salt + 1);
    if (!o) continue;
    made.push({ o, i });
    st.avoid = avoidIds([...o.ids, ...o.acc.map((x) => x.id)], liked, kindOf, perKind);
  }
  const out = await Promise.all(made.map(async ({ o, i: n }): Promise<FeedOutfit | null> => {
    const [fo] = await toFeedOutfits(cat, g, [o], [{}], n);
    return fo ? { ...fo, wl: [...o.ids, ...o.acc.map((x) => x.id)].filter((id) => liked.has(id)) } : null;
  }));
  return { items: out.filter((x): x is FeedOutfit => !!x), usable: liked.size, next: i };
}
