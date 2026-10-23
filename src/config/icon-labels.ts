// One-word labels shown when an attribute icon is tapped (display only). Edit here only; the type forces a label for every icon id.
import type { IconId } from "@/lib/outfit-icons";

export const ICON_LABEL_MS = 1500;   // how long a label stays fully visible (fade in/out come from src/config/motion.ts)
export const ICON_HIT_PX = { w: 30, h: 32 } as const;   // invisible tap area per icon (the 26 px disc sits in its middle)
export const ICON_LABEL_STYLE = { fontSize: 11, color: "#8b9099", gapPx: 1 } as const;

export const ICON_LABELS: Record<IconId, string> = {
  "family-smart": "Smart", "family-street": "Street", "family-active": "Active", "family-rugged": "Rugged", "family-soft": "Soft",
  "season-spring": "Spring", "season-summer": "Summer", "season-autumn": "Autumn", "season-winter": "Winter",
  rain: "Rain", evening: "Evening", office: "Office", resort: "Resort", contrast: "Contrast", bold: "Bold", tonal: "Tonal", colourful: "Colourful", formal: "Formal",
  "item-accessory": "Accessory", "item-shoes": "Shoes", "item-top": "Top", "item-bottom": "Bottom", "dir-women": "Women", "dir-men": "Men",
};
