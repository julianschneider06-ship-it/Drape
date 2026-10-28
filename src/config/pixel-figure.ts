// Pixel-art outfit preview figure + pixel-art seasonal decoration (display only). Tunables first, then the figure's pixel data and colour rules.
export const PIXEL_FIGURE_POSE: "front" | "side" = "front";
export const DECO_PX_MULT = 1.25;  // one decoration pixel = this many figure pixels (the decorations are 16x16 bitmaps, so their pixels are finer than the old 9x9 ones at 2)
export const DECO_MAX_COUNT = 6;   // most snowflakes / leaves per spot (the two spots stay)

/** Figure grid in pixels: 20 columns x 40 rows (the SVG viewBox is in these units). */
export const PIXEL_GRID = { w: 20, h: 40 } as const;

/** Ops are [key, x, y, w, h], filled in order (later ops overwrite earlier ones). Origin top-left, x to the right, y down.
 *  Keys: H beanie dome, h beanie cuff, S skin, K eyes, B hoodie, b hoodie shade, c drawstrings, P trousers, p trousers shade, q trousers hem / far leg,
 *  W shoe, w shoe sole / far shoe, v far-shoe sole, X bag, x bag handle, L women's hair. */
export type PixelOp = readonly [key: string, x: number, y: number, w: number, h: number];

/** Legs and shoes of the front figure (the same for every template); torso, head and face come from the templates below. */
export const LEGS_OPS: Record<"men" | "women", readonly PixelOp[]> = {
  men: [
    ["P", 4, 28, 12, 3], ["P", 4, 31, 5, 6], ["p", 8, 31, 1, 6], ["P", 11, 31, 5, 6], ["p", 15, 31, 1, 6],
    ["q", 4, 37, 5, 1], ["q", 11, 37, 5, 1],
    ["W", 4, 38, 5, 1], ["w", 4, 39, 5, 1], ["W", 11, 38, 5, 1], ["w", 11, 39, 5, 1],
  ],
  women: [
    ["P", 5, 27, 10, 3], ["P", 4, 30, 5, 7], ["P", 11, 30, 5, 7], ["p", 8, 30, 1, 7], ["p", 15, 30, 1, 7],
    ["q", 4, 37, 5, 1], ["q", 11, 37, 5, 1],
    ["W", 4, 38, 5, 1], ["w", 4, 39, 5, 1], ["W", 11, 38, 5, 1], ["w", 11, 39, 5, 1],
  ],
};

/** Knee-length shorts instead of trousers (front pose): same hip, legs end at the knee, bare lower legs (skin S) and the same shoes. */
export const SHORTS_OPS: Record<Gender, readonly PixelOp[]> = {
  men: [
    ["P", 4, 28, 12, 3], ["P", 4, 31, 5, 3], ["p", 8, 31, 1, 3], ["P", 11, 31, 5, 3], ["p", 15, 31, 1, 3],
    ["q", 4, 34, 5, 1], ["q", 11, 34, 5, 1],
    ["S", 5, 35, 3, 3], ["S", 12, 35, 3, 3],
    ["W", 4, 38, 5, 1], ["w", 4, 39, 5, 1], ["W", 11, 38, 5, 1], ["w", 11, 39, 5, 1],
  ],
  women: [
    ["P", 5, 27, 10, 3], ["P", 4, 30, 5, 4], ["P", 11, 30, 5, 4], ["p", 8, 30, 1, 4], ["p", 15, 30, 1, 4],
    ["q", 4, 34, 5, 1], ["q", 11, 34, 5, 1],
    ["S", 5, 35, 3, 3], ["S", 12, 35, 3, 3],
    ["W", 4, 38, 5, 1], ["w", 4, 39, 5, 1], ["W", 11, 38, 5, 1], ["w", 11, 39, 5, 1],
  ],
};
export const LEGS_KEYS = ["trousers", "shorts"] as const;
export type LegsKey = (typeof LEGS_KEYS)[number];
/** The bottom is shorts when its category is listed here, or else its title contains one of the words (whole words, lower case). Everything else keeps the trousers. */
export const SHORTS_CATEGORIES: ReadonlySet<string> = new Set(["shorts", "denim shorts", "cargo shorts", "bermuda shorts", "bike shorts", "biker shorts", "athletic shorts", "running shorts", "swim shorts", "board shorts", "sweat shorts", "skort"]);
export const SHORTS_KEYWORDS: readonly string[] = ["short", "shorts", "bermuda", "skort"];

/** Ready-made pixel templates (front pose). Rows of 20 characters (the figure grid width); "." = empty, the other characters are the op keys above plus
 *  z = jacket zip line / cardigan buttons, c on a cardigan = the inner shirt, Q / y = pattern colour and its shade, G = sunglasses, F = glasses frame. A template is laid over the grid at its row offset; later layers overwrite earlier ones
 *  (legs, torso, head, face, bag). Nothing is computed per outfit: the outfit only picks a key. The women's head templates keep the long hair + ponytail
 *  with no head accessory; with a cap / beanie / hat only the ponytail end shows. */
export const TORSO_Y = 11, TORSO_ROWS = 17, HEAD_Y = 0, HEAD_ROWS = 13;
export type Gender = "men" | "women";
export const TORSO_KEYS = ["hoodie", "jacket", "tee", "sweater", "cardigan", "sweatshirt"] as const;
export const HEAD_KEYS = ["none", "beanie", "cap", "hat"] as const;
export const FACE_KEYS = ["sunglasses", "glasses"] as const;
export type TorsoKey = (typeof TORSO_KEYS)[number];
export type HeadKey = (typeof HEAD_KEYS)[number];
export type FaceKey = (typeof FACE_KEYS)[number];

export const TORSO_TEMPLATES: Record<Gender, Record<TorsoKey, readonly string[]>> = {
  men: {
    hoodie: [
      "..BBBBBBBBBBBBBBBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBcBBcBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "....BBBbbbbbbBBB....",
      "....BBBbbbbbbBBB....",
      "....BBBbbbbbbBBB....",
      "....bbbbbbbbbbbb....",
    ],
    jacket: [
      "..BBBbbbbSSbbbbBBB..",
      "..BBbBbbbBBbbbBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..BBbBBBBzbBBBBbBB..",
      "..bbbBBBBzbBBBBbbb..",
      "..SSSBBBBzbBBBBSSS..",
      "..SSSBbbBzbBbbBSSS..",
      ".....BBBBzbBBBB.....",
      ".....BBBBzbBBBB.....",
      ".....BBBBzbBBBB.....",
      ".....bbbbbbbbbb.....",
    ],
    tee: [
      "..BBBBBbSSSSbBBBBB..",
      "..BBBBBBBBBBBBBBBB..",
      "..BBBBBBBBBBBBBBBB..",
      "..BBBBBBBBBBBBBBBB..",
      "..bbbBBBBBBBBBBbbb..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      ".....BBBBBBBBBB.....",
      ".....BBBBBBBBBB.....",
      ".....BBBBBBBBBB.....",
      ".....bbbbbbbbbb.....",
    ],
    sweater: [
      "..BBBBBBbSSbBBBBBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..bbbBBBBBBBBBBbbb..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      ".....BBBBBBBBBB.....",
      ".....BBBBBBBBBB.....",
      ".....bBbBbBbBbBbB...",
      ".....bbbbbbbbbb.....",
    ],
    cardigan: [
      "..BBBBBbSSSSbBBBBB..",
      "..BBbBBBbSSbBBBbBB..",
      "..BBbBBBzccbBBBbBB..",
      "..BBbBBBbccbBBBbBB..",
      "..BBbBBBzccbBBBbBB..",
      "..BBbBBBbccbBBBbBB..",
      "..BBbBBBzccbBBBbBB..",
      "..BBbBBBbccbBBBbBB..",
      "..BBbBBBzccbBBBbBB..",
      "..BBbBBBbccbBBBbBB..",
      "..bbbBBBzccbBBBbbb..",
      "..SSSBBBbccbBBBSSS..",
      "..SSSBBBzccbBBBSSS..",
      ".....BBBbccbBBB.....",
      ".....BBBzccbBBB.....",
      ".....BBBbccbBBB.....",
      ".....bbbbbbbbbb.....",
    ],
    sweatshirt: [
      "..BBBBBBbSSbBBBBBB..",
      "..BBbBBbbbbbbBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..BBbBBBBBBBBBBbBB..",
      "..bbbBBBBBBBBBBbbb..",
      "..SSSBBBBBBBBBBSSS..",
      "..SSSBBBBBBBBBBSSS..",
      ".....BBBBBBBBBB.....",
      ".....BBBBBBBBBB.....",
      ".....bbbbbbbbbb.....",
      ".....bbbbbbbbbb.....",
    ],
  },
  women: {
    hoodie: [
      "....BBBBSSSSBBBB....",
      "....bBBBcBBcBBBb....",
      "....bBBBcBBcBBBb....",
      "....bBBBcBBcBBBb....",
      "....bBBBcBBcBBBb....",
      "....bBBBcBBcBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....SSBBBBBBBBSS....",
      "....SSBBbbbbBBSS....",
      "......BBbbbbBB......",
      "......BBbbbbBB......",
      "......BBBBBBBB......",
      "......bbbbbbbb......",
      "....................",
    ],
    jacket: [
      "....BBbbbSSbbbBB....",
      "....bBbbBzbBbbBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bBBBBzbBBBBb....",
      "....bbBBBzbBBBbb....",
      "....SSBBBzbBBBSS....",
      "....SSbbBzbBbbSS....",
      "......BBBzbBBB......",
      "......BBBzbBBB......",
      "......BBBzbBBB......",
      "......bbbbbbbb......",
      "....................",
    ],
    tee: [
      "....BBBbSSSSbBBB....",
      "....BBBBBBBBBBBB....",
      "....BBBBBBBBBBBB....",
      "....BBBBBBBBBBBB....",
      "....bbBBBBBBBBbb....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "......BBBBBBBB......",
      "......BBBBBBBB......",
      "......BBBBBBBB......",
      "......BBBBBBBB......",
      "......bbbbbbbb......",
      "....................",
    ],
    sweater: [
      "....BBBBbSSbBBBB....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bbBBBBBBBBbb....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "......BBBBBBBB......",
      "......BBBBBBBB......",
      "......bBbBbBbB......",
      "......bbbbbbbb......",
      "....................",
    ],
    cardigan: [
      "....BBBbSSSSbBBB....",
      "....bBBBbSSbBBBb....",
      "....bBBBzccbBBBb....",
      "....bBBBbccbBBBb....",
      "....bBBBzccbBBBb....",
      "....bBBBbccbBBBb....",
      "....bBBBzccbBBBb....",
      "....bBBBbccbBBBb....",
      "....bBBBzccbBBBb....",
      "....bbBBzccbBBbb....",
      "....SSBBbccbBBSS....",
      "....SSBBzccbBBSS....",
      "......BBzccbBB......",
      "......BBbccbBB......",
      "......BBzccbBB......",
      "......bbbbbbbb......",
      "....................",
    ],
    sweatshirt: [
      "....BBBBbSSbBBBB....",
      "....bBBBbbbbBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bBBBBBBBBBBb....",
      "....bbBBBBBBBBbb....",
      "....SSBBBBBBBBSS....",
      "....SSBBBBBBBBSS....",
      "......BBBBBBBB......",
      "......BBBBBBBB......",
      "......bbbbbbbb......",
      "......bbbbbbbb......",
      "....................",
    ],
  },
};
export const HEAD_TEMPLATES: Record<Gender, Record<HeadKey, readonly string[]>> = {
  men: {
    none: [
      "......LLLLLLLL......",
      ".....LLLLLLLLLL.....",
      ".....LLLLLLLLLL.....",
      ".....LLLLLLLLLL.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      "....................",
      "....................",
    ],
    beanie: [
      ".......HHHHHH.......",
      "......HHHHHHHH......",
      ".....HHHHHHHHHH.....",
      "....hhhhhhhhhhhh....",
      "....hhhhhhhhhhhh....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      "....................",
      "....................",
    ],
    cap: [
      ".......HHHHHH.......",
      "......HHHHHHHH......",
      ".....HHHHHHHHHH.....",
      ".....HHHHHHHHHH.....",
      "..hhhhhhhhhhhhh.....",
      ".....ShhhhhhhhS.....",
      ".....SSSSSSSSSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      "....................",
      "....................",
    ],
    hat: [
      ".......HHHHHH.......",
      "......HHHHHHHH......",
      "......HHHHHHHH......",
      "..hhhhhhhhhhhhhhhh..",
      "...hhhhhhhhhhhhhh...",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSKSSSSKSS.....",
      ".....SSSSSSSSSS.....",
      ".....SSSSSSSSSS.....",
      "....................",
      "....................",
    ],
  },
  women: {
    none: [
      "......LLLLLLLL......",
      "......LLLLLLLL......",
      "......LLLLLLLL.LL...",
      ".....LLLLLLLLLLLL...",
      ".....LLSSSSSSLL.LL..",
      ".....LLSSSSSSLL.LL..",
      ".....LLSKSSKSLL.LL..",
      ".....LLSKSSKSLL.LL..",
      ".....LLSSSSSSLL.LL..",
      ".....LLSSSSSSLL.LL..",
      ".....LL..SS..LL.LL..",
      ".....LL......LL.LL..",
      ".....LL......LL.....",
    ],
    beanie: [
      "........HHHH........",
      ".......HHHHHH.......",
      "......HHHHHHHH......",
      "......hhhhhhhh......",
      "......hhhhhhhh......",
      ".......SSSSSS.LL....",
      ".......SKSSKS..LL...",
      ".......SKSSKS..LL...",
      ".......SSSSSS..LL...",
      ".......SSSSSS..LL...",
      ".........SS....LL...",
      "...............LL...",
      "....................",
    ],
    cap: [
      "........HHHH........",
      ".......HHHHHH.......",
      ".......HHHHHH.......",
      ".......HHHHHH.......",
      "...hhhhhhhhhh.......",
      ".......SSSSSS.LL....",
      ".......SKSSKS..LL...",
      ".......SKSSKS..LL...",
      ".......SSSSSS..LL...",
      ".......SSSSSS..LL...",
      ".........SS....LL...",
      "...............LL...",
      "....................",
    ],
    hat: [
      "........HHHH........",
      ".......HHHHHH.......",
      ".......HHHHHH.......",
      "....hhhhhhhhhhhh....",
      ".....hhhhhhhhhh.....",
      ".......SSSSSS.LL....",
      ".......SKSSKS..LL...",
      ".......SKSSKS..LL...",
      ".......SSSSSS..LL...",
      ".......SSSSSS..LL...",
      ".........SS....LL...",
      "...............LL...",
      "....................",
    ],
  },
};
/** drawn on top of the head template, over the eyes; they combine with cap / beanie / hat */
export const FACE_TEMPLATES: Record<Gender, Record<FaceKey, readonly string[]>> = {
  men: {
    sunglasses: [
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      ".....GGGGGGGGGG.....",
      "......GGG..GGG......",
      "....................",
      "....................",
      "....................",
      "....................",
    ],
    glasses: [
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "......FFF..FFF......",
      ".....FF.FFFF.FF.....",
      "......F.F..F.F......",
      "......FFF..FFF......",
      "....................",
      "....................",
      "....................",
    ],
  },
  women: {
    sunglasses: [
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      ".......GGGGGG.......",
      ".......GG..GG.......",
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
    ],
    glasses: [
      "....................",
      "....................",
      "....................",
      "....................",
      "....................",
      ".......FFFFFF.......",
      ".......F.FF.F.......",
      ".......F.FF.F.......",
      ".......FFFFFF.......",
      "....................",
      "....................",
      "....................",
      "....................",
    ],
  },
};

/** Category -> template lookups (keys are lower-case classification subcategories / accessory types, see `templateKey`). Real values of the catalogue; add more as they appear.
 *  Unknown top category = `TORSO_FALLBACK`. Any head accessory type not listed = no head template; any face type not listed = none. */
export const TORSO_FALLBACK: TorsoKey = "hoodie";
export const TORSO_BY_CATEGORY: Readonly<Record<string, TorsoKey>> = {
  hoodie: "hoodie", pullover: "hoodie", fleece: "hoodie", "quarter zip": "hoodie", thermal: "hoodie", "thermal shirt": "hoodie", longsleeve: "hoodie", "long sleeve tee": "hoodie", "long sleeve top": "hoodie",
  "rugby shirt": "hoodie", tracksuit: "hoodie",
  sweatshirt: "sweatshirt", crewneck: "sweatshirt", "crew neck": "sweatshirt",
  sweater: "sweater", jumper: "sweater", knit: "sweater", "knit sweater": "sweater", "knit top": "sweater", "polo sweater": "sweater", turtleneck: "sweater", "crew neck sweater": "sweater",
  cardigan: "cardigan", "knit cardigan": "cardigan",
  jacket: "jacket", blazer: "jacket", coat: "jacket", "bomber jacket": "jacket", "chore jacket": "jacket", "shirt jacket": "jacket", overshirt: "jacket", vest: "jacket",
  "puffer jacket": "jacket", "fleece jacket": "jacket", "leather jacket": "jacket", "denim jacket": "jacket", "trench coat": "jacket", parka: "jacket", "track jacket": "jacket", "padded jacket": "jacket",
  "down jacket": "jacket", "field jacket": "jacket", "trucker jacket": "jacket", "suede jacket": "jacket", "varsity jacket": "jacket", "zip jacket": "jacket", "hooded jacket": "jacket",
  "rain jacket": "jacket", raincoat: "jacket", windbreaker: "jacket", anorak: "jacket", "sweater vest": "jacket",
  tshirt: "tee", "t shirt": "tee", tee: "tee", shirt: "tee", polo: "tee", "polo shirt": "tee", "tank top": "tee", blouse: "tee", henley: "tee", jersey: "tee", "flannel shirt": "tee", "sleeveless shirt": "tee",
  "crop top": "tee", cami: "tee", camisole: "tee", top: "tee", bodysuit: "tee", "halter top": "tee", "peplum top": "tee", dress: "tee", jumpsuit: "tee",
};
/** Fallback for a top whose category is NOT in the table above: the first row whose word / phrase occurs in the title (whole words, lower case) wins; none = `TORSO_FALLBACK`. */
export const TORSO_KEYWORDS: readonly (readonly [TorsoKey, readonly string[]])[] = [
  ["cardigan", ["cardigan"]],
  ["sweatshirt", ["sweatshirt", "crewneck", "crew neck"]],
  ["hoodie", ["hoodie", "hooded"]],
  ["sweater", ["sweater", "knit", "knitted", "jumper", "pullover"]],
  ["jacket", ["jacket", "coat", "blazer"]],
  ["tee", ["tee", "t-shirt", "tshirt", "shirt", "polo", "tank"]],
];
export const HEAD_BY_TYPE: Readonly<Record<string, Exclude<HeadKey, "none">>> = { cap: "cap", beanie: "beanie", hat: "hat" };
/** The classifier files many caps and beanies under type "hat" (which has the all-around brim). For a "hat" the title can say better: first matching row wins, otherwise it stays a hat. */
export const HEAD_KEYWORDS: readonly (readonly [Exclude<HeadKey, "none" | "hat">, readonly string[]])[] = [
  ["beanie", ["beanie", "watch cap", "knit hat", "bobble"]],
  ["cap", ["cap", "snapback", "trucker", "baseball", "dad hat"]],
];
export const FACE_BY_TYPE: Readonly<Record<string, FaceKey>> = { sunglasses: "sunglasses", glasses: "glasses", eyeglasses: "glasses" };
export const BAG_TYPES: readonly string[] = ["bag", "backpack"];

/** the figure faces right */
export const SIDE_OPS: readonly PixelOp[] = [
  ["H", 5, 0, 10, 3], ["h", 5, 3, 10, 2], ["S", 5, 5, 10, 6], ["S", 15, 8, 1, 2], ["K", 12, 7, 1, 2],
  ["B", 4, 11, 1, 3], ["B", 5, 11, 9, 16], ["b", 8, 12, 3, 10], ["S", 8, 22, 3, 2],
  ["B", 4, 24, 11, 4], ["b", 4, 27, 11, 1],
  ["P", 4, 28, 11, 3], ["P", 5, 31, 4, 6], ["p", 9, 31, 1, 6], ["q", 10, 31, 4, 6], ["q", 5, 37, 9, 1],
  ["W", 6, 38, 5, 1], ["w", 6, 39, 5, 1], ["w", 11, 38, 5, 1], ["v", 11, 39, 5, 1],
];

/** drawn last, only when the outfit has a bag */
export const BAG_OPS = {
  front: [["x", 17, 24, 2, 1], ["X", 16, 25, 4, 6]],
  side: [["x", 10, 24, 2, 1], ["X", 9, 25, 4, 6]],
} as const satisfies Record<"front" | "side", readonly PixelOp[]>;


/** Pattern overlays drawn on the torso (17 rows x 20, same size as a torso template): "1" = pattern pixel. They are masked to the torso: only cells that are body (B) or body shade (b) take the pattern
 *  colour (Q, shade y); skin, collar, drawstrings, zip and buttons stay. Colour: the second entry of the product's colours, else a darker (light top) or lighter (dark top) variant of the main colour. */
export const PATTERN_KEYS = ["stripes", "checks", "dots", "print"] as const;
export type PatternKey = (typeof PATTERN_KEYS)[number];
export const PATTERN_BITMAPS: Record<PatternKey, readonly string[]> = {
  stripes: [
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
    "11111111111111111111",
    "....................",
  ],
  checks: [
    "....1...1...1...1...",
    "....1...1...1...1...",
    "11111111111111111111",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "11111111111111111111",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "11111111111111111111",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "....1...1...1...1...",
    "11111111111111111111",
    "....1...1...1...1...",
    "....1...1...1...1...",
  ],
  dots: [
    "....................",
    "...1...1...1...1....",
    "....................",
    ".....1...1...1...1..",
    "....................",
    "...1...1...1...1....",
    "....................",
    ".....1...1...1...1..",
    "....................",
    "...1...1...1...1....",
    "....................",
    ".....1...1...1...1..",
    "....................",
    "...1...1...1...1....",
    "....................",
    ".....1...1...1...1..",
    "....................",
  ],
  print: [
    "....................",
    "....................",
    "....................",
    ".......111111.......",
    ".......111111.......",
    ".......111111.......",
    ".......111111.......",
    ".......111111.......",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
    "....................",
  ],
};
/** classification pattern value -> overlay ("solid" = none). A value not listed here (floral, camo ...) is looked up through the title keywords instead. */
export const PATTERN_BY_ATTR: Readonly<Record<string, PatternKey | "solid">> = { solid: "solid", stripes: "stripes", checks: "checks", dots: "dots", graphic: "print", logo: "print" };
/** Title fallback: the first row whose word / phrase occurs in the title (whole words, lower case) wins; none = solid. */
export const PATTERN_KEYWORDS: readonly (readonly [PatternKey, readonly string[]])[] = [
  ["stripes", ["stripe", "striped", "stripes", "pinstripe"]],
  ["checks", ["check", "checked", "plaid", "gingham", "tartan", "fair isle", "jacquard"]],
  ["dots", ["dot", "dots", "polka"]],
  ["print", ["graphic", "print", "printed", "logo"]],
];
/** second pattern colour when the product has only one: light tops (luminance above `lightAbove`) get the main colour times `darken`, others get it mixed `lighten` of the way toward white */
export const PATTERN_COLOR = { lightAbove: 0.4, darken: 0.68, lighten: 0.4, shadeY: 0.72 } as const;

export const PIXEL_KEYS = "HhSKBbcPpqWwvXxLzGFQy";

/** Colour rules. Shades multiply every channel by the factor; the constants never follow the outfit. */
export const PIXEL_COLORS = {
  skin: "#e6c4a2", eyes: "#1a1a1a", hair: "#3a2e28", sunglasses: "#17171b", glasses: "#3b3b40",   // men's no-beanie hair and the women's long hair
  fallback: { top: "#4a4a4f", bottom: "#8fa0b3", shoes: "#f1efe9" },   // used when a part has no usable colour
  shade: { z: 0.55, b: 0.72, p: 0.78, q: 0.65, w: 0.87, v: 0.71, h: 0.81, x: 0.7 },
  strings: { onDark: "#d8d8d8", onLight: "#8a8a8a", lightAbove: 0.6 },   // drawstrings: pale on a dark hoodie, grey when the hoodie luminance is above `lightAbove`
  maxLuminance: 0.88, mixTo: "#bdbdbd",                                  // outfit colours lighter than this are mixed toward `mixTo` so they show on white
} as const;
