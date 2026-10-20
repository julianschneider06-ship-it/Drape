// Image check: ONE call per product image (cutout if available), low resolution, strict JSON. Everything tunable lives here.
export const IMAGE_CHECK_REV = "ic1";

export const DEFECTS = ["hanger", "mannequin", "cropped", "folded", "text_overlay", "model_visible", "other"] as const;
// Serious = the product is out of the feed (after trying other images). folded/other are recorded only.
export const SERIOUS_DEFECTS = new Set<string>(["hanger", "mannequin", "cropped", "text_overlay", "model_visible"]);
export const MIN_CONFIDENCE = Number(process.env.DRAPE_IMAGE_CHECK_MIN_CONF ?? 0.5);

export const IMAGE_CHECK_SCHEMA = {
  type: "object",
  properties: {
    item_count: { type: "integer", minimum: 0, maximum: 12 },
    is_single_product: { type: "boolean" },
    defects: { type: "array", items: { type: "string", enum: [...DEFECTS] } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["item_count", "is_single_product", "defects", "confidence"],
  additionalProperties: false,
} as const;

export const PROMPT = (p: { slot: string }) => `You check a product image for a fashion feed that cuts products out and arranges them in a collage.
The product should be a single ${p.slot === "full_body" ? "dress, jumpsuit or one-piece" : p.slot === "top" ? "top or outerwear" : p.slot === "bottom" ? "trousers, shorts or skirt" : "pair of shoes"}.
Answer about THE IMAGE:
- item_count: how many separate sellable items are visible. A pair of shoes = 1. A matching set clearly sold as one product (e.g. bra + shorts, suit jacket + trousers shown together as one set) = 1. A row/stack/pile of several garments (three tees, two trousers, several colours of the same item) = the number of garments. Items from a different category used only for styling still count.
- is_single_product: true only if the image shows exactly one product (see rules above).
- defects (list, empty if none): hanger (a hanger or hook is visible), mannequin (a mannequin or body form is visible), cropped (the product is cut off by the image edge), folded (the garment is folded or piled), text_overlay (added text, labels, size charts or badges drawn over the image), model_visible (a person or body part wearing the product is visible), other (any other serious problem, e.g. heavy damage or a missing part of the product after background removal).
- confidence: 0..1, how sure you are about the whole answer.
Transparent backgrounds were replaced with white. Be strict and literal; do not guess about things you cannot see.`;
