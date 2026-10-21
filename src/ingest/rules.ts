// Cheap keyword rules for the coarse taxonomy (category, gender). Fine-grained style comes from AI later.
import type { Category, Gender } from "./types";

const rx = (words: string) => new RegExp(`\\b(?:${words})\\b`, "i");

const NOT_FASHION = rx("gift ?cards?|e-?gift|sticker|candle|shipping|insurance|protection|sample|swatch|repair|gift ?wrap|poster|book|mug|bottle|towel|blanket|pillow|laundry|care kit|cleaner|brush|keychain|lighter|ashtray|costumes?|cosplay");

// Order matters: first match wins.
const CATEGORY_RULES: [Category, RegExp][] = [
  ["shoes", rx("sneakers?|shoes?|boots?|sandals?|loafers?|slippers?|trainers?|clogs?|mules?|heels?|pumps?|flats|footwear|runners?|schuhe?|stiefel|sneaker|slides?|moccasins?")],
  ["accessories", rx("bags?|totes?|backpacks?|hats?|caps?|beanies?|scarf|scarves|belts?|wallets?|socks?|gloves?|mittens?|sunglasses|glasses|eyewear|shades|jewel(?:ry|lery)|necklaces?|pendants?|anklets?|brooch(?:es)?|bangles?|hoops?|studs?|charms?|rings?|bracelets?|earrings?|visors?|berets?|bonnets?|fedoras?|clutch(?:es)?|crossbody|satchels?|purses?|handbags?|duffel|messenger|fanny pack|bum bag|shawls?|bow ?ties?|ties?(?!-?dye)|umbrellas?|bandanas?|headbands?|accessor(?:y|ies)|tasche[n]?|mützen?|müts?e|schals?|gürtel|socken|handschuhe|rucksack|hüte?|bucket hat|duffle|pouch|cardholders?|keyrings?|watch(?:es)?|laces|scrunchies?|neckties?|hair clips?")],
  ["dresses", rx("dress(?:es)?|jumpsuits?|rompers?|playsuits?|kleid(?:er)?|overalls?|gown|bodycon")],
  ["outerwear", rx("jackets?|coats?|parkas?|anoraks?|puffers?|blazers?|gilets?|trench|windbreakers?|vests?|fleece|bombers?|cagoules?|outerwear|mantel|jacke[n]?|weste|shell|overshirt|raincoat|poncho|cape|shacket")],
  ["bottoms", rx("pants?|trousers?|jeans?|shorts?|skirts?|leggings?|joggers?|sweatpants?|hosen?|chinos?|cargos?|röcke|denim|bottoms?|tights|culottes?|trackpants?|skorts?")],
  ["tops", rx("t-?shirts?|tees?|shirts?|tops?|tanks?|hoodies?|sweatshirts?|sweaters?|knit(?:s|wear)?|cardigans?|jumpers?|polos?|bodysuits?|blouses?|crew(?:neck)?|pullovers?|strick|bluse|longsleeves?|sweat|henley|camis?|bralettes?|bras?|tunics?|shirt|oberteile?|pullis?|tops")],
];

export function inferCategory(...texts: (string | undefined | null)[]): Category {
  // Only the product type and title can disqualify a product (tags are too noisy).
  if (NOT_FASHION.test(texts.slice(0, 2).filter(Boolean).join(" "))) return "other";
  // Try each text in priority order (product type first, then title, then tags).
  for (const t of texts) {
    if (!t) continue;
    const text = t.replace(/short[- ]sleeves?/gi, "sleeved").replace(/long[- ]sleeves?/gi, "sleeved");
    for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return "other";
}

const WOMEN = rx("women'?s?|womens|woman|ladies|lady|damen|female|womenswear|womens?-");
const MEN = rx("men'?s?|mens|man|herren|male|menswear");
const KIDS = rx("kids?|boys?|girls?|toddlers?|baby|babies|youth|junior|children|kinder");

export function inferGender(fallback: Gender | null, ...texts: (string | undefined | null)[]): Gender | null {
  const t = texts.filter(Boolean).join(" ").replace(/[-_/]/g, " ");
  if (KIDS.test(t)) return "kids";
  const w = WOMEN.test(t), m = MEN.test(t);
  if (w && !m) return "women";
  if (m && !w) return "men";
  if (w && m) return "unisex";
  return fallback;
}

export const normKey = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
