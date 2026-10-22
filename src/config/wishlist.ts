// Wishlist > "Generate Outfits": outfits composed from the device's liked products (display only, nothing stored). Edit here only.
export const WISHLIST_REUSE_RATE = 0.3;   // chance per outfit that its liked main piece is one that was already used in this scroll (otherwise a not yet used one; used pieces are spread by how rarely they were used)
export const WISHLIST_PAGE = 4;           // outfits composed per request while scrolling (no upper limit)
export const WISHLIST_MAX_LIKED = 600;    // most liked ids a request carries (the newest ones)
