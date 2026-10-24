// Background image for the liked-outfit views only (Wishlist > Generate Outfits and My Outfits).
// The rest of the app stays white.
export const WISHLIST_BG = {
  enabled: true,
  src: "/backgrounds/wishlist.webp",   // 900x1600 webp, shown with background-size: cover
  overlayOpacity: 0,                   // 0..1 white veil over the image for readability; 0 = none
} as const;
