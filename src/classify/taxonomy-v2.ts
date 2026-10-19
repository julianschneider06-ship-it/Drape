// Taxonomy v2: feed slot + image suitability + 24 style weights. (v1 rows stay untouched in the database.)
import { STYLES, STYLE_KEYS } from "./styles";

export const TAXONOMY_VERSION = "v2";
// Prompt revision (stored in usage, part of the input hash). 2 = plain light-neutral backdrops count as feed-suitable.
export const PROMPT_REV = 2;

export const FEED_SLOTS = ["top", "bottom", "shoes", "full_body", "none"] as const;
export const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"] as const;
export const GENDERS = ["women", "men", "unisex"] as const;
export const COLORS = [
  "black", "white", "grey", "beige", "brown", "navy", "blue", "green", "olive", "red",
  "burgundy", "pink", "purple", "orange", "yellow", "cream", "silver", "gold", "multicolor",
] as const;
export const PATTERNS = ["solid", "stripes", "checks", "floral", "graphic", "logo", "animal", "dots", "camo", "colorblock", "other"] as const;
export const MATERIALS = [
  "cotton", "denim", "wool", "knit", "fleece", "leather", "suede", "synthetic_leather", "linen", "silk",
  "satin", "polyester", "nylon", "down_padded", "corduroy", "canvas", "mesh", "other",
] as const;
export const SILHOUETTES = ["slim", "straight", "relaxed", "oversized", "cropped", "boxy", "a_line", "flared", "tapered"] as const;
export const FITS = ["slim", "regular", "loose", "oversized"] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const VIEWS = ["front", "back", "side", "detail", "flat_lay", "on_model"] as const;
export const BACKGROUNDS = ["white", "neutral", "busy"] as const;

const num01 = { type: "number", minimum: 0, maximum: 1 } as const;
const enumOf = (v: readonly string[]) => ({ type: "string", enum: [...v] }) as const;
const arrayOf = (v: readonly string[], min: number, max: number) =>
  ({ type: "array", items: enumOf(v), minItems: min, maxItems: max, uniqueItems: true }) as const;

export const CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "feed_slot", "is_outer_layer", "statement_level", "style_weights", "category", "subcategory", "gender", "colors",
    "pattern", "material", "silhouette", "fit", "boldness", "formality", "season", "confidence",
    "has_model", "view", "background", "feed_suitability", "needs_cutout",
  ],
  properties: {
    feed_slot: enumOf(FEED_SLOTS),
    is_outer_layer: { type: "boolean" },
    statement_level: num01,
    style_weights: {
      type: "object",
      additionalProperties: false,
      required: [...STYLE_KEYS],
      properties: Object.fromEntries(STYLE_KEYS.map((s) => [s, num01])),
    },
    category: enumOf(CATEGORIES),
    subcategory: { type: "string", pattern: "^[a-z][a-z ]{1,29}$" },
    gender: enumOf(GENDERS),
    colors: arrayOf(COLORS, 1, 3),
    pattern: enumOf(PATTERNS),
    material: enumOf(MATERIALS),
    silhouette: enumOf(SILHOUETTES),
    fit: enumOf(FITS),
    boldness: num01,
    formality: num01,
    season: arrayOf(SEASONS, 1, 4),
    confidence: num01,
    has_model: { type: "boolean" },
    view: enumOf(VIEWS),
    background: enumOf(BACKGROUNDS),
    feed_suitability: num01,
    needs_cutout: { type: "boolean" },
  },
} as const;

const styleLines = Object.entries(STYLES).map(([k, d]) => `- ${k}: ${d}`).join("\n");

export const PROMPT = (p: { brand: string; name: string }) => `You are a fashion product tagger for an outfit-feed app. Look at the product image and the title, then fill the JSON schema.

Title: "${p.name}"
Brand: "${p.brand}"

The feed shows an outfit as 3 stacked slots: top, bottom, shoes. Decide which slot this item belongs to:
- feed_slot "top": tops AND outerwear (shirts, tees, knits, hoodies, jackets, coats, overshirts).
- feed_slot "bottom": trousers, jeans, skirts, shorts.
- feed_slot "shoes": all footwear.
- feed_slot "full_body": items that cover top and bottom (dresses, jumpsuits, matching two-piece sets).
- feed_slot "none": bags, hats, belts, scarves, socks, jewelry, sunglasses and other accessories.
- is_outer_layer: true only for jackets, coats, overshirts and similar pieces worn over another top.
- statement_level 0..1: how much the item is the eye-catching centerpiece of an outfit (0 = quiet basic, 1 = bold centerpiece).

style_weights: give EVERY style a number 0..1. Most items have only 2-5 notable styles; set all the others to 0. Style is a combination, never one label. The styles:
${styleLines}

Other fields:
- category: tops | bottoms | dresses | outerwear | shoes | accessories.
- subcategory: one short lowercase noun, e.g. hoodie, chinos, loafers, shirt jacket, midi dress.
- colors: 1-3 colors of the item itself (not the model, background or other garments), most dominant first.
- pattern, material (best visual guess, use the title as a hint), silhouette, fit, season: pick the closest allowed value(s).
- boldness 0..1: 0 = very quiet, 1 = very eye-catching. formality 0..1: 0 = loungewear, 1 = black tie.
- confidence 0..1: how sure you are about the whole result.

Image judgement (about THIS image only):
- has_model: true if a person or mannequin body is visible wearing or holding the item.
- view: front | back | side | detail | flat_lay | on_model.
- background: white (plain white or very light studio backdrop, including off-white, light grey and warm beige) | neutral (plain but clearly coloured or mid/dark grey) | busy (scene, room, outdoors, pattern, gradient).
- feed_suitability 0..1: how well this image works as a feed image, which must be a frontal product shot on a plain light background, product only, no model, whole item visible. A plain light-neutral backdrop (white, off-white, light grey, warm beige) is as good as pure white: do NOT lower the score for it. 1 = perfect; below 0.5 = unusable.
- needs_cutout: true only if the background is busy or strongly coloured, or a person/mannequin is in the image, so the item would have to be cut out first. A plain light backdrop means false.

Return only JSON.`;
