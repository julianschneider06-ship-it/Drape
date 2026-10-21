// Season of an outfit, computed on demand from its pieces (no column, no storage). Pure, shared by the composer, the analysis and (later) the pool job.
// Input: per piece its season mask (bit 1 spring, 2 summer, 4 autumn, 8 winter; 0 / 15 = seasonless) and what kind of piece it is.
// 1. intersect the pieces' season lists; 2. weight the pieces that DECIDE the season (outerwear, shorts / skirts, boots / sandals, beanie / scarf / gloves /
// sunglasses) more strongly; 3. if several seasons remain pick the most specific one; "all" only for truly seasonless outfits; 4. fit 0..1 = how clear.
export type SeasonName = "spring" | "summer" | "autumn" | "winter" | "all";
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
const BIT = { spring: 1, summer: 2, autumn: 4, winter: 8 } as const;

export interface SeasonPiece {
  mask: number;                       // season list as bits (0 or 15 = no information / all seasons)
  role?: "acc" | "outer" | "shorts" | "skirt" | "boots" | "sandals" | "beanie" | "scarf" | "gloves" | "sunglasses" | "hat" | "light-outer" | "tank" | null;
}
export interface SeasonResult { season: SeasonName; fit: number; mask: number; votes: Record<string, number> }

const W: Record<string, number> = { acc: 0.4, outer: 2.5, "light-outer": 2, shorts: 2, skirt: 1.6, boots: 2, sandals: 2, beanie: 2, scarf: 2, gloves: 2, sunglasses: 1.5, hat: 1.0, tank: 1.5 };
const pop = (m: number) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1));

/** role of a piece from its name / subcategory (used by the composer; accessories pass their type) */
export function seasonRole(slot: string, text: string, outer: boolean, cold: boolean, warm: boolean, accType?: string): SeasonPiece["role"] {
  if (accType) return (["beanie", "scarf", "gloves", "sunglasses"].includes(accType) ? accType : accType === "hat" || accType === "cap" ? "hat" : "acc") as SeasonPiece["role"];   // "acc" = bag, belt, watch, jewellery ...: no veto
  const t = text.toLowerCase();
  if (slot === "shoes") return /\b(sandal|slide|flip|espadrille|slingback|thong)s?\b/.test(t) || /\b(sandals?|slides?)\b/.test(t) ? "sandals" : /\b(boots?|chelsea|hiker)\b/.test(t) ? "boots" : null;
  if (slot === "bottom") return /\b(shorts?|skort|bermuda)\b/.test(t) ? "shorts" : /\bskirt\b/.test(t) && /\b(mini|short)\b/.test(t) ? "skirt" : null;
  if (outer || cold) return cold ? "outer" : "light-outer";
  if (/\b(tank|camisole|cami|halter|sleeveless|bandeau|crop)\b/.test(t) || warm) return "tank";
  return null;
}

export function outfitSeason(pieces: SeasonPiece[]): SeasonResult {
  const ms = pieces.map((p) => ({ m: !p.mask || p.mask === 15 ? 15 : p.mask & 15, role: p.role ?? null }));
  // neutral accessories (bag, belt, watch, jewellery: role "acc") only vote, they never narrow the intersection (their season lists are too coarse to veto an outfit)
  let inter = 15; for (const x of ms) if (x.role !== "acc") inter &= x.m;
  // weighted votes: a piece spreads its weight over its own seasons (a winter-only coat votes fully winter, an all-season shirt votes little for each)
  const votes: Record<string, number> = { spring: 0, summer: 0, autumn: 0, winter: 0 }; let total = 0;
  for (const x of ms) {
    const w = x.role ? W[x.role] ?? 1 : 1, k = pop(x.m);
    if (k === 4) continue;                       // seasonless piece: no information
    total += w;
    for (const s of SEASONS) if (x.m & BIT[s]) votes[s] += w / k;
  }
  const has = (r: string) => ms.some((x) => x.role === r);
  const decisive = ms.some((x) => x.role && x.m !== 15);
  if (total === 0 && inter === 15) return { season: "all", fit: 1, mask: 15, votes };   // truly seasonless
  if (inter === 0) {                                                                    // the pieces disagree: take the vote, low fit
    const best = [...SEASONS].sort((a, b) => votes[b] - votes[a])[0];
    return { season: best, fit: Math.max(0, Math.min(0.35, (votes[best] / Math.max(1e-9, total)) * 0.35)), mask: 0, votes };
  }
  const cand = SEASONS.filter((s) => inter & BIT[s]);
  let season: SeasonName;
  if (cand.length === 1) season = cand[0];
  else if (cand.length === 4) season = decisive ? ([...SEASONS].sort((a, b) => votes[b] - votes[a])[0]) : "all";
  else {
    // several seasons remain: most specific one
    const set = cand.join("+");
    if (set === "spring+summer") season = has("shorts") || has("sandals") || has("tank") ? "summer" : has("light-outer") ? "spring" : "summer";
    else if (set === "autumn+winter") season = has("outer") || has("beanie") || has("scarf") || has("gloves") || has("boots") ? "winter" : "autumn";
    else if (set === "spring+autumn") season = has("light-outer") || has("boots") ? "autumn" : "spring";
    else if (set === "summer+autumn") season = has("shorts") || has("sandals") ? "summer" : "autumn";
    else if (set === "winter+spring" || set === "spring+winter") season = has("outer") || has("beanie") || has("scarf") ? "winter" : "spring";
    else season = [...cand].sort((a, b) => votes[b] - votes[a])[0];
  }
  // fit: how clear the answer is = how much of the vote the winner has, how few seasons were left after the intersection, and whether decisive pieces back it up
  const share = season === "all" ? 1 : votes[season] / Math.max(1e-9, total);
  const narrow = pop(inter) === 1 ? 1 : pop(inter) === 2 ? 0.7 : pop(inter) === 3 ? 0.5 : 0.3;
  const backed = ms.some((x) => x.role && x.m !== 15 && (x.m & BIT[season as keyof typeof BIT]) !== 0) ? 1 : 0.7;
  return { season, fit: +Math.max(0, Math.min(1, 0.45 * share + 0.35 * narrow + 0.2 * backed)).toFixed(3), mask: inter, votes };
}
