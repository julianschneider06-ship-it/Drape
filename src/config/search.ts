// Search tab: options and limits (display text in English, plain words). Edit here only.
// The user picks a style FAMILY, never a single style: no individual style name appears anywhere in the search UI, texts or link parameters.
import type { StyleFamily } from "@/config/style-families";
import type { IconId } from "@/lib/outfit-icons";

export const SEARCH_PAGE = 4;             // outfits composed per request while scrolling (the ordered product list is worked through on demand, no cap on the list)
export const SEARCH_STORE_CAP = 5;        // per tier, at most this many pieces of one shop come first (keeps one shop from filling the page)
export const SEARCH_MIN_EXACT = 8;        // fewer exact matches than this: the optional filters are relaxed (extra first, then season)

export type Direction = "women" | "men";
export const DIRECTIONS: { id: Direction; label: string; hint: string }[] = [
  { id: "women", label: "Women", hint: "Women\u2019s pieces and outfits" },
  { id: "men", label: "Men", hint: "Men\u2019s pieces and outfits" },
];
export const dirIcon = (d: Direction): IconId => `dir-${d}`;

export type SearchItem = "accessory" | "shoes" | "top" | "bottom";
export const ITEMS: { id: SearchItem; label: string; hint: string }[] = [
  { id: "accessory", label: "Accessory", hint: "Bags, jewellery, hats and more" },
  { id: "shoes", label: "Shoes", hint: "Sneakers, boots, sandals" },
  { id: "top", label: "Top", hint: "Shirts, knits, jackets" },
  { id: "bottom", label: "Bottom", hint: "Trousers, jeans, skirts" },
];

export const FAMILY_INFO: Record<StyleFamily, { label: string; hint: string }> = {
  smart: { label: "Smart", hint: "Clean, elegant and calm" },
  street: { label: "Street", hint: "Urban and edgy" },
  active: { label: "Active", hint: "Sport and outdoor" },
  rugged: { label: "Rugged", hint: "Hard-wearing and worn-in" },
  soft: { label: "Soft", hint: "Romantic, flowy, holiday" },
};

export type SearchSeason = "spring" | "summer" | "autumn" | "winter";
export const SEASONS: { id: SearchSeason; label: string; hint: string }[] = [
  { id: "spring", label: "Spring", hint: "Light layers, fresh days" },
  { id: "summer", label: "Summer", hint: "Warm and airy" },
  { id: "autumn", label: "Autumn", hint: "Cosy layers, cooler days" },
  { id: "winter", label: "Winter", hint: "Warm and covered up" },
];

/** the extras describe the searched PIECE (rules in src/lib/search-index.ts); outfit-only ones (tonal, pattern break) are not offered */
export type SearchExtra = "rain" | "evening" | "office" | "resort" | "bold" | "colourful" | "formal";
export const EXTRAS: { id: SearchExtra; label: string; hint: string }[] = [
  { id: "rain", label: "Rain", hint: "Ready for wet weather" },
  { id: "evening", label: "Evening", hint: "Dressy pieces for after dark" },
  { id: "office", label: "Office", hint: "Smart pieces for work" },
  { id: "resort", label: "Holiday", hint: "Relaxed pieces for warm trips" },
  { id: "bold", label: "Bold", hint: "A statement piece that stands out" },
  { id: "colourful", label: "Colourful", hint: "A colour or print, not a neutral" },
  { id: "formal", label: "Formal", hint: "Very dressed up" },
];

export const itemIcon = (i: SearchItem): IconId => `item-${i}`;
export const familyIcon = (f: StyleFamily): IconId => `family-${f}`;
export const seasonIcon = (s: SearchSeason): IconId => `season-${s}`;
export const extraIcon = (e: SearchExtra): IconId => e;   // every extra id is also an icon id

/** "Shine" strokes around the searched piece in Search results (decoration only). Edit here to tweak the look; ?shine=0 turns it off. */
export const SHINE = {
  count: 9,              // strokes around the piece, evenly spread
  length: 9,             // px per stroke
  distance: 7,           // px from the piece edge to the inner end of a stroke
  saleExtra: 7,          // extra px of distance when the red sale outline is shown (strokes sit outside the outline)
  width: 1.6,            // line width in px
  wobble: 1.1,           // px of hand-drawn wobble
  fallback: "#8b9099",   // light grey of the attribute icons: no usable colour, or red colour on a sale piece
  minContrast: 3,        // WCAG contrast against white a stroke colour must reach (lighter colours are darkened)
  redTolerance: 28,      // degrees of hue around red that count as "close to red" next to the sale outline
};

/** the Search selection is kept for the session in sessionStorage (selection only) */
export const SEARCH_STATE_KEY = "drape.search.state";
/** Highlight chip: the shine strokes show only while it is on (localStorage, default off) */
export const HIGHLIGHT_KEY = "drape.highlight";
