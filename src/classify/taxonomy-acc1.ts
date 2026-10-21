// Accessory taxonomy acc1: what kind of accessory, how big, is the image usable inline (front_flat), plus the shared style fields.
// (v2 rows of the main pieces stay untouched; accessories get their own taxonomy_version.)
import { STYLES, STYLE_KEYS } from "./styles";
import { BACKGROUNDS, COLORS, GENDERS, MATERIALS, PATTERNS, SEASONS, VIEWS } from "./taxonomy-v2";

export const TAXONOMY_VERSION = "acc1";
export const PROMPT_REV = 1;

export const ACCESSORY_TYPES = [
  "cap", "hat", "beanie", "scarf", "bag", "backpack", "belt", "necklace", "bracelet", "earrings", "ring", "watch", "sunglasses", "gloves", "tie",
  "other_wearable", "not_fashion", "excluded_for_now",
] as const;
export type AccessoryType = (typeof ACCESSORY_TYPES)[number];
/** Types that can appear in the feed. not_fashion and excluded_for_now (socks, underwear) stay out. */
export const WEARABLE_TYPES = ACCESSORY_TYPES.filter((t) => t !== "not_fashion" && t !== "excluded_for_now");
export const SIZE_CLASSES = ["small", "medium", "large"] as const;
export const BELT_SHAPES = ["straight_strip", "coiled", "other", "not_a_belt"] as const;
export const PRESENTATIONS = ["spread_front", "folded", "other"] as const;
export const ACC_MATERIALS = [...MATERIALS, "metal", "plastic", "acetate", "gemstone", "pearl", "straw", "rubber"] as const;

const num01 = { type: "number", minimum: 0, maximum: 1 } as const;
const enumOf = (v: readonly string[]) => ({ type: "string", enum: [...v] }) as const;
const arrayOf = (v: readonly string[], min: number, max: number) => ({ type: "array", items: enumOf(v), minItems: min, maxItems: max, uniqueItems: true }) as const;

export const ACC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "accessory_type", "size_class", "front_flat", "belt_shape", "subcategory", "gender", "statement_level", "style_weights", "colors", "pattern", "material",
    "boldness", "formality", "season", "confidence", "has_model", "view", "background", "feed_suitability", "presentation", "item_count",
  ],
  properties: {
    accessory_type: enumOf(ACCESSORY_TYPES),
    size_class: enumOf(SIZE_CLASSES),
    front_flat: { type: "boolean" },
    belt_shape: enumOf(BELT_SHAPES),
    subcategory: { type: "string", pattern: "^[a-z][a-z ]{1,29}$" },
    gender: enumOf(GENDERS),
    statement_level: num01,
    style_weights: { type: "object", additionalProperties: false, required: [...STYLE_KEYS], properties: Object.fromEntries(STYLE_KEYS.map((s) => [s, num01])) },
    colors: arrayOf(COLORS, 1, 3),
    pattern: enumOf(PATTERNS),
    material: enumOf(ACC_MATERIALS),
    boldness: num01,
    formality: num01,
    season: arrayOf(SEASONS, 1, 4),
    confidence: num01,
    has_model: { type: "boolean" },
    view: enumOf(VIEWS),
    background: enumOf(BACKGROUNDS),
    feed_suitability: num01,
    presentation: enumOf(PRESENTATIONS),
    item_count: { type: "integer", minimum: 0, maximum: 12 },
  },
} as const;

const styleLines = Object.entries(STYLES).map(([k, d]) => `- ${k}: ${d}`).join("\n");

export const PROMPT = (p: { brand: string; name: string; subcategory?: string | null }) => `You are a fashion product tagger for an outfit-feed app. The product below was sold as an accessory. Look at the image and the title, then fill the JSON schema.

Title: "${p.name}"
Brand: "${p.brand}"${p.subcategory ? `\nShop category: "${p.subcategory}"` : ""}

accessory_type (pick exactly one):
- cap (baseball/trucker/snapback/dad cap, visor), hat (brimmed or other hats: bucket, fedora, straw, beret, bonnet), beanie (knit/wool cuffed or slouchy winter hat)
- scarf (scarves, shawls, bandanas, neckerchiefs), tie (neckties, bow ties), gloves (gloves, mittens)
- bag (handbags, totes, crossbody, clutch, pouches, wallets-on-chain, duffels), backpack (rucksacks, backpacks)
- belt, necklace (also pendants, chains), bracelet (also bangles, cuffs, anklets), earrings (a pair or a single earring/set sold as one), ring, watch, sunglasses (also optical glasses)
- other_wearable (hair accessories, brooches, pins, wearable items that fit no other type)
- not_fashion: not worn as part of an outfit: shoe care, cleaning, mugs, vases, flasks, water bottles, laptop cases, lunch boxes, key rings, gift items, home goods, stickers, gift cards
- excluded_for_now: socks, underwear, tights, loungewear
size_class: small (watches, glasses, jewelry, ties, belts), medium (hats, caps, beanies, scarves, gloves, small bags), large (big bags, totes, backpacks, duffels).
front_flat: true ONLY if the image shows the item clearly frontal, flat and symmetric so it could be placed inline in a collage: sunglasses seen straight from the front with both lenses, a necklace laid out front-facing in a U or circle, a belt laid out. Angled, side, 3/4, folded, worn or detail views are false.
belt_shape (belts only, otherwise "not_a_belt"): straight_strip (laid out as one straight horizontal strip), coiled (rolled up or looped), other.
gender: women | men | unisex (accessories are often unisex).
statement_level 0..1: how much the item is an eye-catching centerpiece (0 = quiet basic, 1 = bold centerpiece).

style_weights: give EVERY style a number 0..1. Most items have only 2-5 notable styles; set all the others to 0. Style is a combination, never one label. The styles:
${styleLines}

Other fields:
- subcategory: one short lowercase noun phrase, e.g. baseball cap, tote bag, hoop earrings, chronograph watch.
- colors: 1-3 colors of the item itself, most dominant first (metals: gold or silver). pattern, material (best visual guess; use the title), season (when it is typically worn).
- boldness 0..1 (0 = very quiet, 1 = very eye-catching). formality 0..1 (0 = loungewear, 1 = black tie). confidence 0..1: how sure you are about the whole result.

Image judgement (about THIS image only):
- has_model: true if a person or mannequin body is visible wearing or holding the item.
- view: front | back | side | detail | flat_lay | on_model. background: white (plain white or very light studio backdrop) | neutral (plain but clearly coloured or mid/dark grey) | busy (scene, room, outdoors, pattern, gradient).
- feed_suitability 0..1: how well this image works as a feed image: product only on a plain light background, whole item visible, no model.
- presentation: spread_front = the item is shown fully, straight from the front and symmetric; folded = folded, rolled, piled; other = angled, twisted, draped or any other view.
- item_count: how many separate sellable items are visible (a pair of earrings or shoes = 1; a clearly one-product set = 1; several products side by side = their number).

Return only JSON.`;
