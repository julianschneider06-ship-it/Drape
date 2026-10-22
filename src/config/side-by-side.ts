// Side-by-side outfit layout (top left, bottom right; display only, no change to selection, feed or data). Used by src/lib/layout/rules.ts.
// Centre line = vertical middle of the card area (the canvas: between the header and the bottom bar, i.e. canvas height * SIDE_BY_SIDE.centerY).
// The top is centred on that line; the bottom (always right of the top) sits lower by SIDE_BY_SIDE_BOTTOM_OFFSET x the top's rendered height.
// Above the line: head items and glasses. Below the line: shoes and all other accessories.
export const SIDE_BY_SIDE_BOTTOM_OFFSET = 0.15;
export const SIDE_BY_SIDE = {
  centerY: 0.5,       // centre line as a share of the canvas height
  headZoneH: 0.17,    // height kept free above the pair for head items / glasses (share of H); the pair shrinks if it would take more
  lowerZoneH: 0.30,   // height kept free below the pair for shoes + accessories (share of H)
  zoneGap: 0.012,     // min gap between neighbours / to the centre line (share of H)
  minScale: 0.5,      // zone items shrink down to this factor to fit before the lowest-priority one is dropped
};
