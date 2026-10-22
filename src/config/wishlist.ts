// Wishlist > "Generate Outfits": outfits composed from the device's liked products (display only, nothing stored). Edit here only.
export const WISHLIST_REUSE_RATE = 0.3;   // chance per outfit that its liked main piece is one that was already used in this scroll (otherwise a not yet used one; used pieces are spread by how rarely they were used)
export const WISHLIST_PAGE = 4;           // outfits composed per request while scrolling (no upper limit)
export const WISHLIST_MAX_LIKED = 600;    // most liked ids a request carries (the newest ones)

// Wishlist > Products heart. Liked = black fill; soft-unliked (stays in the list until the Wishlist is entered again) = white fill with a faint outline and soft shadow so it shows on white.
export const WISHLIST_HEART = {
  size: 18,
  on: { fill: "#000000", stroke: "#000000" },
  off: { fill: "#ffffff", stroke: "rgba(0,0,0,0.28)", shadow: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" },
};
