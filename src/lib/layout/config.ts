// ONE place for everything that defines how an outfit is composed on the canvas. Edit numbers here, not in components.
// All fractions are relative to the canvas (width W / height H) unless stated otherwise.
// Canvas = the area below the header: width = min(screen, MAX_CANVAS_W), height = screen height minus header/footer.

export const MAX_CANVAS_W = 416;            // px: centred with this max width on larger screens
export const HEADER_PX = 52;                // space reserved above the canvas (fixed header)
export const BUTTON_BAR_PX = 60;            // space reserved below the canvas for the two 48 px circle buttons (+6 px above and below); the phone's bottom safe area comes on top
export const MARGIN_ZONE = 0.18;            // free column (fraction of W) on one side, reserved for accessories later (nothing is placed there)
export const FRAME_PAD = 0.012;              // vertical padding of the usable frame (fraction of H)

export const EDGE_PAD = 0.025;             // min gap between the composition and the canvas edge on the open side (fraction of W)
// Sizes = class caps (SIZE, fractions of the canvas) x these factors. Split: top/bottom and shoes scale separately.
// v3.1: top/bottom 1.243 x 1.20 = 1.4916, shoes 1.243 x 1.50 = 1.8645 (the class caps are scaled with them, i.e. raised by the same factors).
export const SCALE_TOP_BOTTOM = 1.4916;
export const SCALE_SHOES = 1.8645;
export const pieceScale = (slot: string) => (slot === "shoes" ? SCALE_SHOES : SCALE_TOP_BOTTOM);

// --- Sizes by garment class: a piece is fitted inside (maxW * W) x (maxH * H), keeping its content aspect ratio. ---
export type GarmentClass = "top" | "outer" | "longcoat" | "trousers" | "shorts" | "skirt" | "longskirt" | "shoes" | "full";
export const SIZE: Record<GarmentClass, { maxW: number; maxH: number }> = {
  top:       { maxW: 0.49, maxH: 0.28 }, // tees, shirts, knits (45-50% of the width, shorter than the trousers)
  outer:     { maxW: 0.50, maxH: 0.34 }, // jackets, hoodies, blazers
  longcoat:  { maxW: 0.46, maxH: 0.50 }, // coats, trenches, parkas
  trousers:  { maxW: 0.44, maxH: 0.48 }, // the largest piece: ~45-50% of the height, ~40-45% of the width
  shorts:    { maxW: 0.46, maxH: 0.30 }, // lower height cap
  skirt:     { maxW: 0.46, maxH: 0.34 },
  longskirt: { maxW: 0.40, maxH: 0.46 },
  shoes:     { maxW: 0.32, maxH: 0.16 }, // 28-34% of the width
  full:      { maxW: 0.50, maxH: 0.65 }, // dresses, jumpsuits, sets: up to ~65% of the height
};
// Content aspect (w/h) to assume when a product has no measured bounding box yet.
export const DEFAULT_ASPECT: Record<GarmentClass, number> = {
  top: 1.1, outer: 1.0, longcoat: 0.7, trousers: 0.5, shorts: 1.0, skirt: 0.9, longskirt: 0.45, shoes: 1.5, full: 0.5,
};

// Garment class from the product name (no database change needed).
export function garmentClass(slot: "top" | "bottom" | "shoes" | "full", name: string): GarmentClass {
  const n = name.toLowerCase();
  if (slot === "shoes" || slot === "full") return slot;
  if (slot === "bottom") {
    if (/\b(shorts?|skort|bermuda)\b/.test(n)) return "shorts";
    if (/\bskirt\b/.test(n)) return /\b(midi|maxi|long|column)\b/.test(n) ? "longskirt" : "skirt";
    return "trousers";
  }
  if (/\b(coat|trench|parka|overcoat|duster|cape|poncho|raincoat|maxi)\b/.test(n)) return "longcoat";
  if (/\b(jacket|bomber|blazer|puffer|anorak|gilet|vest|cardigan|overshirt|fleece|hoodie|windbreaker|shacket)\b/.test(n)) return "outer";
  return "top";
}

// Source image width requested from the CDN: the piece's widest possible size (at MAX_CANVAS_W) / share of the image the product
// covers * DPR, rounded to 100. Depends only on the product + garment class, so render and prefetch use the same URL.
export const SRC = { dpr: 1.6, min: 400, max: 1100, fallback: 700 };

// --- Randomness (deterministic per outfit: same outfit = same layout every time) ---
export const JITTER = {
  clusterX: 0.025, clusterY: 0.02,   // whole composition, fraction of W / H (+-)
  shoesX: 0.015,                     // extra horizontal wobble of the shoes (fraction of W)
  shoeRotDeg: 3.5,                   // shoes only (+-)
};
export const OVERLAP = {
  waist: [0.03, 0.06] as [number, number], // top over the trouser waistband, fraction of the top's height
  hemY: [0.15, 0.25] as [number, number],  // shoes over the trouser hem, fraction of the shoe's height
};

// --- Templates. Positions are centres inside the usable frame (canvas minus margin zone), 0..1 on both axes. ---
// below: place under another piece (top edge = its bottom edge minus overlap); hem: shoes at the hem of the bottom/dress.
// hem.side: +1 shoe sits right of the hem and overlaps it by overlapX of the shoe width, -1 left, 0 centred on the hem, 'free' uses cx.
export interface Place {
  cx: number; cy?: number;
  below?: { of: "top"; overlap: [number, number] };
  hem?: { side: 1 | -1 | 0 | "free"; overlapX: number; of: "bottom" | "full" };
}
export interface Template {
  id: string; label: string; kind: "three" | "full"; margin: "left" | "right";
  top?: Place; bottom?: Place; full?: Place; shoes: Place; z: { top: number; bottom: number; shoes: number; full: number };
}
const Z3 = { top: 2, bottom: 1, shoes: 3, full: 1 };
const BASE: Template[] = [
  { id: "A", label: "left stack, shoes right of the hem", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.38, cy: 0.20 }, bottom: { cx: 0.38, below: { of: "top", overlap: OVERLAP.waist } },
    shoes: { cx: 0.5, hem: { side: 1, overlapX: 0.30, of: "bottom" } } },
  { id: "B", label: "top left, trousers right, shoes bottom centre", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.30, cy: 0.17 }, bottom: { cx: 0.70, cy: 0.55 },
    shoes: { cx: 0.46, hem: { side: "free", overlapX: 0, of: "bottom" } } },
  { id: "C", label: "trousers right and large, top upper-left, shoes lower-left", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.30, cy: 0.15 }, bottom: { cx: 0.70, cy: 0.50 },
    shoes: { cx: 0.3, hem: { side: -1, overlapX: 0.25, of: "bottom" } } },
  { id: "D", label: "centred stack, shoes right of the hem", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.47, cy: 0.20 }, bottom: { cx: 0.42, below: { of: "top", overlap: OVERLAP.waist } },
    shoes: { cx: 0.6, hem: { side: 1, overlapX: 0.45, of: "bottom" } } },
  { id: "E", label: "top upper-right, trousers left, shoes right of the hem", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.66, cy: 0.16 }, bottom: { cx: 0.30, cy: 0.52 },
    shoes: { cx: 0.5, hem: { side: 1, overlapX: 0.30, of: "bottom" } } },
  { id: "F", label: "staggered: top left, trousers right under it, shoes left of the hem", kind: "three", margin: "right", z: Z3,
    top: { cx: 0.35, cy: 0.20 }, bottom: { cx: 0.66, below: { of: "top", overlap: OVERLAP.waist } },
    shoes: { cx: 0.4, hem: { side: -1, overlapX: 0.30, of: "bottom" } } },
  // full-body piece (dress, jumpsuit, set): big on one side, shoes smaller at the bottom on the other side, overlapping the hem
  { id: "FA", label: "dress left, shoes right of the hem", kind: "full", margin: "right", z: Z3,
    full: { cx: 0.34, cy: 0.40 }, shoes: { cx: 0.6, hem: { side: 1, overlapX: 0.40, of: "full" } } },
  { id: "FB", label: "dress right, shoes left of the hem", kind: "full", margin: "right", z: Z3,
    full: { cx: 0.64, cy: 0.40 }, shoes: { cx: 0.3, hem: { side: -1, overlapX: 0.40, of: "full" } } },
  { id: "FC", label: "dress centre-left, shoes bottom right", kind: "full", margin: "right", z: Z3,
    full: { cx: 0.42, cy: 0.42 }, shoes: { cx: 0.7, hem: { side: 0, overlapX: 0.3, of: "full" } } },
];
// Mirrored versions (id + "m"): everything flipped left-right, margin zone on the left.
const mirrorPlace = (p?: Place): Place | undefined => p && {
  ...p, cx: 1 - p.cx, hem: p.hem && { ...p.hem, side: p.hem.side === "free" ? "free" : ((-p.hem.side) as 1 | -1 | 0) },
};
export const TEMPLATES: Template[] = [
  ...BASE,
  ...BASE.map((t): Template => ({ ...t, id: t.id + "m", label: t.label + " (mirrored)", margin: "left",
    top: mirrorPlace(t.top), bottom: mirrorPlace(t.bottom), full: mirrorPlace(t.full), shoes: mirrorPlace(t.shoes)! })),
];

// --- Rule-based layout (v3): replaces the random templates for standard outfits. All numbers here. ---
export const RULES = {
  enabled: true,              // false = old random templates again
  random: false,              // true = bring back jitter (cluster shift + shoe rotation) on top of the rules; mirroring stays in the old templates
  axisX: 0.38,                // vertical axis of the top/bottom pair (fraction of canvas width): the pair lives in the left half
  centreX: 0.5,               // axis of the shoes (canvas centre)
  seamGap: 0.01,              // white gap between top and bottom (fraction of canvas height)
  ratioClamp: [0.6, 1.7] as [number, number], // allowed w_top / w_bottom when matching hem and waist
  heightRatioRange: [0.4, 2.0] as [number, number], // soft rule: top height / bottom height stays inside this range (limits odd size jumps, e.g. a huge shirt over tiny shorts); seam match gives way
  edgePad: 0.025,             // min distance to the left/right canvas edges (fraction of width)
  edgePadY: 0.015,            // min distance to the top/bottom canvas edges (fraction of height)
  shoeOverlap: 0.50,          // the trouser/dress hem line runs through the middle of the shoes (45-55% of the shoe height overlap)
  foldedTopHalfH: 0.5,        // folded case: the pair sits in the upper part, at most this share of the canvas height
  foldedGap: 0.03,            // folded case: gap between them (fraction of canvas width)
  foldedMaxW: 0.45,           // folded case: each piece at most this share of the canvas width; both pieces have EQUAL VISUAL AREA (aspect ratios kept)
  foldedShoeMaxH: 0.5,        // folded case: shoe height at most this x the (taller) height of the folded pair
  shortAspectMin: 0.95,       // a bottom at least this wide (w/h) counts as a short item, like shorts and knee-length skirts
  shortShoeMaxH: 0.5,         // short bottoms: shoe height at most this x the bottom's height
  shortMaxCover: 0.25,        // short bottoms: shoes cover at most this share of the bottom's height
  foldedShoesCy: 0.76,        // folded case: vertical centre of the shoes (fraction of canvas height), lower half
  foldedFillMin: 0.90,        // geometry override for TOPS: a compact rectangular mask (area/bbox >= this) is a folded shirt even if the model said spread_front
  stackedPresentations: ["spread_front"], // anything else (folded, other) goes to the side-by-side layout; null/unknown = stacked
};
