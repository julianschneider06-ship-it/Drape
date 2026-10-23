// Wishlist > Products type filter (display only). The liked card carries `slot` (= products.feed_slot, which follows products.category:
// tops/outerwear -> top, bottoms -> bottom, dresses -> full_body, shoes -> shoes, accessories -> accessory). Anything unmapped goes to Accessories.
export type LikesGroup = "tops" | "bottoms" | "shoes" | "accessories";

export const LIKES_FILTER_GROUPS: { id: LikesGroup; label: string; slots: string[] }[] = [
  { id: "tops", label: "Tops", slots: ["top", "full_body"] },   // outerwear, dresses and jumpsuits sit with Tops
  { id: "bottoms", label: "Bottoms", slots: ["bottom"] },
  { id: "shoes", label: "Shoes", slots: ["shoes"] },
  { id: "accessories", label: "Accessories", slots: ["accessory", "none"] },   // cap, watch, tie, belt, bag, jewelry, ... and anything unmapped
];
export const LIKES_FILTER_FALLBACK: LikesGroup = "accessories";
