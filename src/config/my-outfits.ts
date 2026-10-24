// Wishlist > "My Outfits": outfits the user builds by hand from liked products (device only, localStorage; nothing is sent except the ids to draw them). Edit here only.
import type { LikesGroup } from "./likes-filter";

export const MY_OUTFITS_MAX_ACCESSORY_SLOTS = 8;   // accessory slots in the editor (the layout draws at most 8 accessories)
export const MY_OUTFITS_MAX_SAVED = 50;            // saved outfits per device
export const MY_OUTFITS_KEY = "drape.myoutfits";   // localStorage: { v: 1, outfits: [{ id, top, bottom, shoes, acc: [ids] }] }
export const MY_OUTFITS_FIRST_ACC_SLOTS = 1;       // accessory slots shown in a new outfit

export type MainSlot = "top" | "bottom" | "shoes";
/** the fixed slots; `groups` = which liked products fit (same grouping as the Wishlist type filter, src/config/likes-filter.ts) */
export const MY_OUTFITS_SLOTS: { id: MainSlot; label: string; groups: LikesGroup[] }[] = [
  { id: "top", label: "Top", groups: ["tops"] },   // outerwear, dresses and jumpsuits sit with Tops (a one-piece fills the Top slot and leaves Bottom empty)
  { id: "bottom", label: "Bottom", groups: ["bottoms"] },
  { id: "shoes", label: "Shoes", groups: ["shoes"] },
];
export const MY_OUTFITS_ACC = { label: "Accessory", groups: ["accessories"] as LikesGroup[] };
export const MY_OUTFITS_FULL_SLOT = "full_body";   // card.slot of a one-piece garment
export const MY_OUTFITS_PAGE_RENDER_MAX = 50;      // outfits per render request (= MY_OUTFITS_MAX_SAVED)

export const MY_OUTFITS_TEXT = {
  empty: "Build your own outfits from the pieces you liked.",
  noLikes: "Like some products first, then build outfits from them.",
  newOutfit: "+ New outfit",
  addAcc: "+ Add accessory",
  removeAcc: "Remove slot",
  full: (max: number) => `You can save up to ${max} outfits. Delete one to add another.`,
  confirmDelete: "Delete this outfit?",
  pickerEmpty: "No liked products fit this slot yet.",
  clear: "Clear slot",
  close: "Close",
  onepiece: "One-piece",
};
