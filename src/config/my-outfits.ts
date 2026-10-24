// Wishlist > "My Outfits": outfits the user builds by hand from liked products (device only, localStorage; nothing is sent except the ids to draw them). Edit here only.
import type { LikesGroup } from "./likes-filter";

export const MY_OUTFITS_ACC_SLOTS = 7;             // accessory slots the editor shows (all optional, any accessory type); derived from the layout: the most that fit at once without overlap on every phone size (tests/my-outfits.test.ts re-checks it). Change here.
export const MY_OUTFITS_MAX_ACCESSORY_SLOTS = 8;   // technical limit of the layout and of the render request (acc1..acc8); only used to cap what is drawn, never what is stored
/** what an empty accessory slot reserves in the layout (one entry per slot, in slot order); mixes head/upper and lower items so the slots use both zones of the side-by-side layout */
export const MY_OUTFITS_ACC_PLACEHOLDERS: { type: string; zone: string }[] = [
  { type: "cap", zone: "head" }, { type: "sunglasses", zone: "upper" }, { type: "bag", zone: "mid" }, { type: "watch", zone: "mid" },
  { type: "necklace", zone: "mid" }, { type: "belt", zone: "mid" }, { type: "ring", zone: "mid" }, { type: "bracelet", zone: "mid" },
];
export const MY_OUTFITS_MAX_SAVED = 50;            // saved outfits per device
export const MY_OUTFITS_KEY = "drape.myoutfits";   // localStorage: { v: 1, outfits: [{ id, top, bottom, shoes, acc: [ids] }] }

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
  missing: (labels: string[]) => `Add ${labels.join(", ")} to save.`,
  moreAcc: "More accessories",
  full: (max: number) => `You can save up to ${max} outfits. Delete one to add another.`,
  confirmDelete: "Delete this outfit?",
  pickerEmpty: "No liked products fit this slot yet.",
  clear: "Clear slot",
  close: "Close",
  onepiece: "One-piece",
};

// Accessory slots in the editor: frame, resize handle, vertical move (Top / Bottom / Shoes are not affected).
export const MY_OUTFITS_ACC_MIN_SCALE = 0.5;       // smallest size, relative to the default slot size
export const MY_OUTFITS_ACC_MAX_SCALE = 2.5;       // largest size, relative to the default slot size
export const MY_OUTFITS_ACC_DRAG_PX = 6;           // movement under this = a tap (opens the picker), over it = a drag
export const MY_OUTFITS_ACC_HANDLE_HIT_PX = 32;    // touch target of the resize handle (the visible corner mark is smaller)
export const MY_OUTFITS_ACC_HANDLE_MARK_PX = 10;   // visible corner mark (length of each arm)
export const MY_OUTFITS_ACC_HANDLE_THICK_PX = 3;   // its thickness (the frame line is 1 px)
export const MY_OUTFITS_ACC_Z_BASE = 100;          // a moved / resized slot is drawn above the layout's own order; the one touched last on top
