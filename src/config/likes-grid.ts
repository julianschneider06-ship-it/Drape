// Wishlist > Products grid density (display only, device only). The button cycles through these column counts.
export const LIKES_GRID_COLUMNS = [2, 3, 4] as const;
export const LIKES_GRID_DEFAULT = 2;
export const LIKES_GRID_KEY = "drape.likes.cols";
/** Gap (Tailwind classes) and image request width per column count (px; used for photos without a cutout, cutouts are stored at display size). */
export const LIKES_GRID_LOOK: Record<number, { gap: string; imgW: number; fill: number; price: string }> = {
  2: { gap: "gap-x-3 gap-y-6", imgW: 500, fill: 0.96, price: "text-sm" },
  3: { gap: "gap-x-2 gap-y-5", imgW: 360, fill: 0.94, price: "text-xs" },
  4: { gap: "gap-x-1.5 gap-y-4", imgW: 260, fill: 0.92, price: "text-[11px]" },
};
/** Heart size per mode; the button (size + 12 px padding) stays >= 32 px everywhere. */
export const LIKES_GRID_HEART = 20;
