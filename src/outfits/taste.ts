// Device taste profile + learned connections (step 4: used by ?feed=hybrid; the weights live in src/lib/personalization/config.ts).
// Per device and gender (about 5 KB): a style vector per slot (24 styles), attribute preferences (colours, categories, silhouettes, formality, boldness),
// preferences over the outfit tags (season, occasion, palette kind, silhouette, formality level, weather, contrast) and a small connection model on
// STYLE / ATTRIBUTE level: top x bottom and bottom x shoes style matrices (24x24 each), formality-gap histogram, category-pair buckets.
// Learned incrementally with exponential decay; applyEvent is pure on the Taste object and shared by the page path (server, applies the client's
// outbox), the replay job (event log = source of truth) and the simulation.
// Why connections are learned on attribute level and not per product pair: there are millions of possible pairs and each pair is seen once or never
// (no data to learn from, no way to score a new product); attributes generalise to every new product at once, need a fixed few KB per device and
// update in O(24x24) per event.
import { STYLE_KEYS } from "../classify/styles";
import { SIGNAL, STEER, TASTE } from "../lib/personalization/config";
import type { CatPiece } from "./catalogue";

const D = STYLE_KEYS.length;
export interface Taste {
  v: 3; n: number;
  styles: { top: Float32Array; bottom: Float32Array; shoes: Float32Array };   // POSITIVE evidence per slot (likes, ups, dwell, keep ...)
  neg: { top: Float32Array; bottom: Float32Array; shoes: Float32Array };      // NEGATIVE evidence per slot (scroll past, swap away, outfit down, unlike), kept apart so
                                                                               // frequent weak negatives cannot push common styles below never-seen ones
  colours: Record<string, number>; silhouettes: Record<string, number>; categories: Record<string, number>;
  formality: number; boldness: number;             // running means over positive events
  tags: Record<string, number>;                    // "se:summer", "oc:office", "pk:neutral", "si:relaxed", "fo:casual", "w:cold", "ct:1" ...
  tb: Float32Array; bs: Float32Array;              // style x style connection matrices (row = first slot's style, column = second slot's)
  fgap: Float32Array;                              // formality gap |top - bottom| in 5 bins
  catPair: Float32Array;                           // hashed category pairs (top sub x bottom sub), 64 buckets
  counts: Record<string, number>;                  // signals seen per type (debug page)
  lastEventId: number;                             // watermark for the idempotent replay job
  updatedAt: number;                               // ms
}
export const newTaste = (): Taste => ({ v: 3, n: 0, styles: { top: new Float32Array(D), bottom: new Float32Array(D), shoes: new Float32Array(D) }, neg: { top: new Float32Array(D), bottom: new Float32Array(D), shoes: new Float32Array(D) }, colours: {}, silhouettes: {}, categories: {},
  formality: 0.4, boldness: 0.3, tags: {}, tb: new Float32Array(D * D), bs: new Float32Array(D * D), fgap: new Float32Array(5), catPair: new Float32Array(64), counts: {}, lastEventId: 0, updatedAt: 0 });

export { SIGNAL };
const hash64 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 64; };
const slotOf = (p: CatPiece) => (p.slot === "full_body" ? "top" : p.slot) as "top" | "bottom" | "shoes";

/** compact outfit tags as carried by the event payloads (src/outfits/tags.ts compactTags); only these keys are learned */
export interface EventTags { se?: string | null; oc?: string | null; pk?: string | null; si?: string | null; fo?: string | null; w?: string | null; ct?: number | null }
const TAG_KEYS = ["se", "oc", "pk", "si", "fo", "w", "ct"] as const;

export type TasteEventType = "like" | "unlike" | "tap_product" | "view_product_click" | "scroll_past" | "outfit_up" | "outfit_down" | "outfit_clear" | "dwell_ms" | "swap" | "keep";
export interface TasteEvent {
  id?: number; type: TasteEventType;
  pieces: CatPiece[];            // the outfit's main pieces as shown (top / bottom / shoes, or full + shoes)
  piece?: CatPiece;              // the single product of like / unlike / tap / view_product_click / keep
  dwell_ms?: number; out?: CatPiece; into?: CatPiece; alt?: number; from?: number;
  prev?: "up" | "down";          // outfit_clear: the reaction that is taken back
  tags?: EventTags | null;       // outfit tags (payload); null = unknown
  boost?: number;                // keep: x keepBoost when the kept piece was also liked / tapped / looked at long
  at?: number;                   // ms
}

const capDict = (d: Record<string, number>) => { const k = Object.keys(d); if (k.length <= TASTE.maxCategories) return; k.sort((a, b) => Math.abs(d[a]) - Math.abs(d[b])).slice(0, k.length - TASTE.maxCategories).forEach((x) => delete d[x]); };
function addPiece(t: Taste, p: CatPiece, w: number) {
  const sl = slotOf(p), s = t.styles[sl], ng = t.neg[sl];
  for (let i = 0; i < D; i++) { s[i] *= TASTE.decay; ng[i] *= TASTE.decay; }
  if (w > 0) for (let i = 0; i < D; i++) s[i] += w * p.vec[i];
  else for (let i = 0; i < D; i++) { const take = Math.min(s[i], -w * p.vec[i] * 0.5); s[i] -= Math.max(0, take); ng[i] += -w * p.vec[i]; }   // a negative also takes back up to half of its weight from the positive side
  const dec = (d: Record<string, number>, k: string) => { if (!k) return; d[k] = (d[k] ?? 0) * TASTE.decay + w; };
  dec(t.colours, p.main); dec(t.silhouettes, p.silhouette); dec(t.categories, p.sub);
  capDict(t.colours); capDict(t.silhouettes); capDict(t.categories);
  if (w > 0) { t.formality += 0.05 * w * (p.formality - t.formality); t.boldness += 0.05 * w * (p.boldness - t.boldness); }
}
function addTags(t: Taste, tags: EventTags | null | undefined, w: number) {
  if (!tags || !w) return;
  for (const k of TAG_KEYS) { const v = tags[k]; if (v === null || v === undefined) continue; const key = `${k}:${v}`; t.tags[key] = (t.tags[key] ?? 0) * TASTE.decay + w * SIGNAL.tagScale; }
}
function addConnections(t: Taste, ps: CatPiece[], w: number) {
  const top = ps.find((p) => p.slot === "top" || p.slot === "full_body"), bottom = ps.find((p) => p.slot === "bottom"), shoes = ps.find((p) => p.slot === "shoes");
  const cd = TASTE.connectionDecay;
  const outer = (m: Float32Array, a: CatPiece, b: CatPiece) => { for (let i = 0; i < D; i++) { const ai = a.vec[i]; if (ai < 0.05) continue; for (let j = 0; j < D; j++) m[i * D + j] = m[i * D + j] * cd + w * ai * b.vec[j]; } };
  if (top && bottom) { outer(t.tb, top, bottom); t.fgap[Math.min(4, Math.floor(Math.abs(top.formality - bottom.formality) * 5))] += w; t.catPair[hash64(`${top.sub}|${bottom.sub}`)] += w; }
  if (bottom && shoes) outer(t.bs, bottom, shoes);
  else if (top && shoes && !bottom) outer(t.bs, top, shoes);
}

/** Incremental update from ONE event (pure on the Taste object; the replay job processes events in id order and stores lastEventId, so replays are skipped). */
export function applyEvent(t: Taste, e: TasteEvent): Taste {
  if (e.id !== undefined) { if (e.id <= t.lastEventId) return t; t.lastEventId = e.id; }
  t.n++; t.counts[e.type] = (t.counts[e.type] ?? 0) + 1; t.updatedAt = e.at ?? t.updatedAt;
  const S = SIGNAL;
  switch (e.type) {
    case "outfit_up": case "outfit_down": case "scroll_past": case "dwell_ms": {
      const w = e.type === "outfit_up" ? S.outfit_up : e.type === "outfit_down" ? S.outfit_down : e.type === "scroll_past" ? S.scroll_past
        : (e.dwell_ms ?? 0) < S.dwellMinMs ? 0 : Math.min(1, ((e.dwell_ms ?? 0) - S.dwellMinMs) / (S.dwellFullMs - S.dwellMinMs) + 0.25) * S.dwellMax;
      if (!w) break;
      const cw = e.type === "outfit_up" ? S.outfit_up_connection : e.type === "outfit_down" ? S.outfit_down_connection : w;
      for (const p of e.pieces) addPiece(t, p, w);
      addConnections(t, e.pieces, cw); addTags(t, e.tags, w);
      break;
    }
    case "outfit_clear": {   // takes the previous up / down back (same weights, opposite sign)
      const w = e.prev === "up" ? -S.outfit_up : e.prev === "down" ? -S.outfit_down : 0; if (!w) break;
      for (const p of e.pieces) addPiece(t, p, w);
      addConnections(t, e.pieces, e.prev === "up" ? -S.outfit_up_connection : -S.outfit_down_connection); addTags(t, e.tags, w);
      break;
    }
    case "like": case "unlike": case "tap_product": case "view_product_click": {
      if (!e.piece) break;
      const w = S[e.type]; addPiece(t, e.piece, w);
      if ((e.type === "like" || e.type === "unlike") && e.pieces.length) { addConnections(t, e.pieces, w * S.likeConnection); addTags(t, e.tags, w * S.likeConnection); }   // a liked piece also says its combination worked
      break;
    }
    case "swap": {
      if (e.out && (e.alt ?? 0) !== (e.from ?? -1)) addPiece(t, e.out, S.swapOut);                     // the piece swiped away: weak -, its attributes only
      if (e.into) addPiece(t, e.into, (e.alt ?? 0) === 0 ? S.swapBack : S.swapIn);                       // back to the original: it was preferred
      break;
    }
    case "keep": { if (e.piece) addPiece(t, e.piece, S.keep * (e.boost ?? 1)); break; }
  }
  return t;
}

const cos = (a: Float32Array, b: ArrayLike<number>) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < D; i++) { const x = Math.max(0, a[i]); d += x * b[i]; na += x * x; nb += b[i] * b[i]; } return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0; };
// maxima of the preference dictionaries, cached per taste state (attrMatch runs for every piece of a slot when the bands are computed)
const maxCache = new WeakMap<object, { n: number; m: number }>();
const dmax = (d: Record<string, number>, n: number) => { const c = maxCache.get(d); if (c && c.n === n) return c.m; let mx = 1e-6; for (const v of Object.values(d)) mx = Math.max(mx, Math.abs(v)); maxCache.set(d, { n, m: mx }); return mx; };
/** attribute match -1..1: colour, category, silhouette preferences + closeness of formality and boldness to the running means */
export function attrMatch(t: Taste, p: CatPiece): number {
  const f = 1 - Math.min(1, Math.abs(p.formality - t.formality) * 2.5), b = 1 - Math.min(1, Math.abs(p.boldness - t.boldness) * 2.5);
  const nm = (d: Record<string, number>, k: string) => (d[k] ?? 0) / dmax(d, t.n);   // -1..1
  return Math.max(-1, Math.min(1, 0.3 * nm(t.colours, p.main) + 0.25 * nm(t.categories, p.sub) + 0.15 * nm(t.silhouettes, p.silhouette) + 0.2 * (f * 2 - 1) + 0.1 * (b * 2 - 1)));
}
/** how well a piece matches the device's taste for its slot, 0..1 (0.5 neutral when there is no history) */
export const tasteMatch = (t: Taste | null, p: CatPiece): number => {
  if (!t || t.n < 5) return 0.5;
  const sl = slotOf(p), s = Math.max(0, Math.min(1, cos(t.styles[sl], p.vec) - TASTE.negWeight * cos(t.neg[sl], p.vec)));
  return STEER.styleVsAttributes * s + (1 - STEER.styleVsAttributes) * (attrMatch(t, p) + 1) / 2;
};
/** tag match -1..1 of an outfit's tags against the device's tag preferences (mean over the tag families that have a preference) */
export function tagMatch(t: Taste | null, tags: EventTags | null): number {
  if (!t || !tags || t.n < TASTE.personalizeFrom) return 0;
  let s = 0, k = 0;
  for (const key of TAG_KEYS) {
    const v = tags[key]; if (v === null || v === undefined) continue;
    const fam = Object.entries(t.tags).filter(([x]) => x.startsWith(`${key}:`)); if (!fam.length) continue;
    const mx = Math.max(1e-6, ...fam.map(([, x]) => Math.abs(x)));
    s += (t.tags[`${key}:${v}`] ?? 0) / mx; k++;
  }
  return k ? Math.max(-1, Math.min(1, s / k)) : 0;
}
/** connection bonus -1..1 for placing b next to a (top-bottom or bottom-shoes), from the learned style x style matrices + formality gap */
export function connBonus(t: Taste | null, a: CatPiece, b: CatPiece): number {
  if (!t || t.n < TASTE.personalizeFrom) return 0;
  const m = a.slot === "bottom" || (a.slot === "top" && b.slot === "shoes") ? t.bs : t.tb; let raw = 0, tot = 1e-6;
  const [x, y] = a.slot === "bottom" && b.slot === "top" ? [b, a] : [a, b];
  for (let i = 0; i < D; i++) { const xi = x.vec[i]; if (xi < 0.05) continue; for (let j = 0; j < D; j++) { raw += xi * y.vec[j] * m[i * D + j]; } }
  for (let k = 0; k < m.length; k++) tot += Math.abs(m[k]);
  let c = Math.tanh((raw / tot) * 12);
  if (x.slot === "top" && y.slot === "bottom") { const gb = Math.min(4, Math.floor(Math.abs(x.formality - y.formality) * 5)); const ft = t.fgap.reduce((s, v) => s + Math.abs(v), 1e-6); c += 0.3 * Math.tanh((t.fgap[gb] / ft) * 4 - 0.2); }
  return Math.max(-1, Math.min(1, c));
}
/** size of the raw state (what one device holds before compression) */
export const tasteBytes = (t: Taste) => 4 * (6 * D + 2 * D * D + 5 + 64) + JSON.stringify({ c: t.colours, s: t.silhouettes, k: t.categories, g: t.tags, n: t.counts }).length + 40;
/** top styles of a slot (debug page, reports) */
export const topStyles = (t: Taste, slot: "top" | "bottom" | "shoes", n = 5) => Array.from(t.styles[slot], (v, i) => [STYLE_KEYS[i], v] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, n);
/** styles with the most negative evidence of a slot */
export const lessStyles = (t: Taste, slot: "top" | "bottom" | "shoes", n = 3) => Array.from(t.neg[slot], (v, i) => [STYLE_KEYS[i], v] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, n);
export { STYLE_KEYS };
