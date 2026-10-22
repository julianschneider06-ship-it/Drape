// Product-level facts for Search (pure, no I/O): which family / season / extras one piece has, computed on demand from the in-memory catalogue.
// Nothing is stored. Extras use the same thresholds as the outfit tags (TAG_RULES), applied to the single piece; extras that only exist for a whole outfit
// (tonal colours, pattern break) have no product-level meaning and are not offered.
import { STYLE_KEYS } from "@/classify/styles";
import { familyOf, STYLE_FAMILIES, type StyleFamily } from "@/config/style-families";
import type { SearchExtra, SearchItem } from "@/config/search";
import type { Catalogue } from "@/outfits/catalogue";
import { RESORT, SMART, TAG_RULES } from "@/outfits/tags";
import type { Gender, SearchRow } from "@/lib/search";

export interface PieceFacts { vec: Float32Array; formality: number; bold: number; statement: number; main: string; mask: number; text: string; full: boolean; warm: boolean }
const NEUTRALS = new Set(["black", "white", "grey", "beige", "cream", "navy", "brown", "silver", "gold"]);
const RAIN = /\b(rain|raincoat|waterproof|anorak|gore-?tex|shell jacket|windbreaker|trench|umbrella)\b/i;
const idx = (keys: readonly string[]) => keys.map((k) => STYLE_KEYS.indexOf(k as never)).filter((i) => i >= 0);
const SMART_I = idx(SMART), RESORT_I = idx(RESORT);
const FAM_I = Object.fromEntries(Object.entries(STYLE_FAMILIES).map(([f, ks]) => [f, idx(ks)])) as Record<StyleFamily, number[]>;

/** family of the piece = family of its dominant style; q = how much of the piece's style belongs to that family (0..1, used for ranking) */
export function familyFacts(vec: Float32Array): { fam: StyleFamily; q: number } | null {
  let bi = 0; for (let i = 1; i < vec.length; i++) if (vec[i] > vec[bi]) bi = i;
  const fam = familyOf(STYLE_KEYS[bi]); if (!fam) return null;
  let e = 0, t = 0; for (let i = 0; i < vec.length; i++) t += vec[i] * vec[i];
  for (const i of FAM_I[fam]) e += vec[i] * vec[i];
  return { fam, q: t > 0 ? e / t : 0 };
}

export function extrasOfPiece(f: PieceFacts): SearchExtra[] {
  let sum = 0; for (const v of f.vec) sum += v;
  const share = (is: number[]) => (sum > 0 ? is.reduce((a, i) => a + f.vec[i], 0) / sum : 0);
  const out: SearchExtra[] = [];
  if (RAIN.test(f.text)) out.push("rain");
  if (f.formality >= TAG_RULES.formality.smart && (f.full || ["black", "navy", "burgundy"].includes(f.main))) out.push("evening");
  if (f.formality >= 0.55 && share(SMART_I) >= 0.45) out.push("office");
  if ((f.warm || ((f.mask & 2) !== 0 && (f.mask & 8) === 0)) && share(RESORT_I) >= 0.25) out.push("resort");
  if (f.bold >= TAG_RULES.bold.boldness || f.statement >= TAG_RULES.bold.statement) out.push("bold");
  if (!NEUTRALS.has(f.main)) out.push("colourful");
  if (f.formality >= TAG_RULES.formality.smart) out.push("formal");
  return out;
}

/** every searchable piece of one gender's catalogue: tops, bottoms, shoes and accessories with a clean cutout card. One-piece garments are not offered as top or bottom. */
export function rowsOf(cat: Catalogue, g: Gender): SearchRow[] {
  const rows: SearchRow[] = [];
  for (const p of cat.pieces) {
    if (!p.genders.includes(g) || !p.card || p.slot === "full_body") continue;
    const f = familyFacts(p.vec); if (!f) continue;
    const mask = p.mask || 15;
    rows.push({ id: p.id, g, item: p.slot as SearchItem, fam: f.fam, mask, q: f.q, store: p.store,
      ex: extrasOfPiece({ vec: p.vec, formality: p.formality, bold: p.boldness, statement: p.statement, main: p.main, mask, text: `${p.name} ${p.sub}`, full: false, warm: p.warm }) });
  }
  for (const a of cat.accs) {
    if (!a.genders.includes(g) || !a.card) continue;
    const f = familyFacts(a.vec); if (!f) continue;
    rows.push({ id: a.id, g, item: "accessory", fam: f.fam, mask: a.mask, q: f.q, store: a.store,
      ex: extrasOfPiece({ vec: a.vec, formality: a.formality, bold: a.bold, statement: a.statement, main: a.main, mask: a.mask, text: a.name, full: false, warm: false }) });
  }
  return rows;
}
