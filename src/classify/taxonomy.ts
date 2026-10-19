// Taxonomy v1: the attributes AI assigns to every product. Style is a COMBINATION of weights, never one label.
export const TAXONOMY_VERSION = "v1";

export const STYLES = [
  "minimal", "classic", "casual", "streetwear", "sporty",
  "romantic", "edgy", "bohemian", "vintage", "elevated", // elevated = polished / tailored / luxe
] as const;
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
export const OUTFIT_ROLES = ["base_top", "statement_top", "layer", "bottom", "one_piece", "outerwear", "footwear", "bag", "accessory"] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;

const num01 = { type: "number", minimum: 0, maximum: 1 } as const;
const enumOf = (v: readonly string[]) => ({ type: "string", enum: [...v] }) as const;
const arrayOf = (v: readonly string[], min: number, max: number) =>
  ({ type: "array", items: enumOf(v), minItems: min, maxItems: max, uniqueItems: true }) as const;

export const CLASSIFICATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "style_weights", "category", "gender", "colors", "pattern", "material", "silhouette",
    "fit", "boldness", "formality", "outfit_role", "season", "confidence",
  ],
  properties: {
    style_weights: {
      type: "object",
      additionalProperties: false,
      required: [...STYLES],
      properties: Object.fromEntries(STYLES.map((s) => [s, num01])),
    },
    category: enumOf(CATEGORIES),
    gender: enumOf(GENDERS),
    colors: arrayOf(COLORS, 1, 3), // dominant first
    pattern: enumOf(PATTERNS),
    material: enumOf(MATERIALS), // best visual guess
    silhouette: enumOf(SILHOUETTES),
    fit: enumOf(FITS),
    boldness: num01, // 0 = very quiet, 1 = very loud / eye-catching
    formality: num01, // 0 = loungewear, 1 = black tie
    outfit_role: enumOf(OUTFIT_ROLES),
    season: arrayOf(SEASONS, 1, 4),
    confidence: num01, // overall certainty of this classification
  },
} as const;

export const PROMPT = (p: { brand: string; name: string }) =>
  `You are a fashion product tagger. Look at the product image and title and fill the schema.
Title: "${p.name}" (brand: ${p.brand}).
Rules:
- style_weights: every style gets a number 0..1 for how strongly the item expresses it; several can be high, they do not need to sum to 1.
- colors: 1-3 colors of the item itself (not the model, background or other garments), most dominant first.
- boldness: 0 = very quiet, 1 = very eye-catching. formality: 0 = loungewear, 1 = black tie.
- material: your best visual guess, use the title as a hint.
- confidence: 0..1, how sure you are about the whole result.
Return only JSON.`;
