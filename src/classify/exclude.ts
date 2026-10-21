// Pieces that are not outfit pieces for the feed. House shoes (fluffy / wool / shearling / fleece mules, slippers, slides, moccasins, loungers) are indoor wear:
// matched by name or subcategory, in the composer / pool (toPiece) and at classification time (classify.ts sets feed_ready = false).
// A plain "slipper" in the name is NOT enough (flat "Riad Slipper" shoes are real shoes; the older toPiece rule for the subcategory "slippers" stays).
export const HOUSE_SHOE = /\b(house (?:shoes?|slippers?)|loungers?|(?:fluffy|fuzzy|cozy|cosy|plush|teddy|sherpa|shearling|fleece|felt|hairy|wool)\b(?:\W+\w+){0,3}?\W+(?:mules?|slides?|moccasins?|slippers?)|(?:mules?|slides?|moccasins?)\b\W+(?:\w+\W+){0,2}?(?:shearling|fleece|fuzzy|fluffy|hairy|plush))\b/i;
