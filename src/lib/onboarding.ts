// First-visit onboarding (3 steps). The two tutorial outfits are PINNED lists of product ids: they never change and are not composed.
// Identified from the product screenshots (brand / name / image match). Outfit A only explains vertical swiping; outfit B explains
// horizontal swapping (top: original + 2 alternatives) and the red sale marker (shoes 1570, watch 14552 and hoodie 15873 are on sale).
export const ONBOARDING = {
  outfitA: { pieces: [16752, 16633, 1578], accessories: [13607, 14718] },                       // HUF Mia Skull tee, Butter Goods Serif Baggy Denim Shorts, Represent Studio Sneaker (cream); Clare V. Toutou cap, Raen Iwa sunglasses
  outfitB: { pieces: [15873, 17597, 1570], accessories: [14552, 13558, 12099], alts: { top: [15821, 9034] } },   // Alpha x Yankees hoodie, Polar Raphael track pants, Represent Studio Sneaker (black); Timex digital watch, Clare V. checker beanie, Gymshark Sharkhead backpack; top alternatives: Alpha x Yankees MA-1 bomber, Sporty & Rich Yankees crewneck
} as const;

/** localStorage flag: set when the user finished the tutorial. ?onboarding=1 forces it again (testing). */
export const ONBOARDING_KEY = "drape.onboarding.done";
