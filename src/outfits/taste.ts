// Device taste profile + learned connections (PROTOTYPE, driven by simulated event streams; not wired into the live app).
// Per device (about 5 KB): a style vector per slot (24 styles), attribute preferences (colours, formality, boldness, silhouettes, categories)
// and a small connection model on STYLE / ATTRIBUTE level, learned incrementally from events:
//   top x bottom and bottom x shoes style matrices (24x24 each), formality-gap histogram, category-pair buckets.
// Why connections are learned on attribute level and not per product pair: there are millions of possible pairs and each pair is seen once or never
// (no data to learn from, no way to score a new product); attributes generalise to every new product at once, need a fixed few KB per device and
// update in O(24x24) per event.
import { STYLE_KEYS } from "../classify/styles";
import type { CatPiece } from "./catalogue";

const D = STYLE_KEYS.length;
export interface Taste {
  v: 1; n: number;
  styles: { top: Float32Array; bottom: Float32Array; shoes: Float32Array };
  colours: Record<string, number>; silhouettes: Record<string, number>; categories: Record<string, number>;
  formality: number; boldness: number;             // running means over positive events
  tb: Float32Array; bs: Float32Array;              // style x style connection matrices (row = first slot's style, column = second slot's)
  fgap: Float32Array;                              // formality gap |top - bottom| in 5 bins
  catPair: Float32Array;                           // hashed category pairs (top sub x bottom sub), 64 buckets
  lastEventId: number;                             // watermark for the idempotent incremental update job
}
export const newTaste = (): Taste => ({ v: 1, n: 0, styles: { top: new Float32Array(D), bottom: new Float32Array(D), shoes: new Float32Array(D) }, colours: {}, silhouettes: {}, categories: {},
  formality: 0.4, boldness: 0.3, tb: new Float32Array(D * D), bs: new Float32Array(D * D), fgap: new Float32Array(5), catPair: new Float32Array(64), lastEventId: 0 });

/** weights of the signals (positive = wants more of this, negative = weak "less"). A swap is an implicit signal, not a dislike. */
export const SIGNAL = { like: 1.0, tap_product: 0.35, view_product_click: 0.8, outfit_up: 0.8, outfit_down: -0.8, scroll_past: -0.2, dwellMax: 0.4, swapOut: -0.3, swapIn: 0.15, swapBack: 0.25 };
const DECAY = 0.995;     // per event: recent behaviour counts more
const hash64 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 64; };
const slotOf = (p: CatPiece) => (p.slot === "full_body" ? "top" : p.slot) as "top" | "bottom" | "shoes";

export interface TasteEvent {
  id?: number; type: "like" | "tap_product" | "view_product_click" | "scroll_past" | "outfit_up" | "outfit_down" | "dwell_ms" | "swap";
  pieces: CatPiece[];            // the outfit's main pieces (top / bottom / shoes, or full + shoes)
  piece?: CatPiece;              // the single product of like / tap / view_product_click
  dwell_ms?: number; out?: CatPiece; into?: CatPiece; alt?: number; from?: number;
}

function addPiece(t: Taste, p: CatPiece, w: number) {
  const s = t.styles[slotOf(p)]; for (let i = 0; i < D; i++) s[i] = s[i] * DECAY + w * p.vec[i];
  t.colours[p.main] = (t.colours[p.main] ?? 0) * DECAY + w; t.silhouettes[p.silhouette] = (t.silhouettes[p.silhouette] ?? 0) * DECAY + w;
  t.categories[p.sub] = (t.categories[p.sub] ?? 0) * DECAY + w;
  if (w > 0) { t.formality += 0.05 * w * (p.formality - t.formality); t.boldness += 0.05 * w * (p.boldness - t.boldness); }
}
function addConnections(t: Taste, ps: CatPiece[], w: number) {
  const top = ps.find((p) => p.slot === "top" || p.slot === "full_body"), bottom = ps.find((p) => p.slot === "bottom"), shoes = ps.find((p) => p.slot === "shoes");
  const outer = (m: Float32Array, a: CatPiece, b: CatPiece) => { for (let i = 0; i < D; i++) { const ai = a.vec[i]; if (ai < 0.05) continue; for (let j = 0; j < D; j++) m[i * D + j] = m[i * D + j] * 0.999 + w * ai * b.vec[j]; } };
  if (top && bottom) { outer(t.tb, top, bottom); t.fgap[Math.min(4, Math.floor(Math.abs(top.formality - bottom.formality) * 5))] += w; t.catPair[hash64(`${top.sub}|${bottom.sub}`)] += w; }
  if (bottom && shoes) outer(t.bs, bottom, shoes);
  else if (top && shoes && !bottom) outer(t.bs, top, shoes);
}

/** Incremental update from ONE event (pure on the Taste object; the job processes events in id order and stores lastEventId, so replays are skipped). */
export function applyEvent(t: Taste, e: TasteEvent): Taste {
  if (e.id !== undefined) { if (e.id <= t.lastEventId) return t; t.lastEventId = e.id; }
  t.n++;
  const outfitW = e.type === "outfit_up" ? SIGNAL.outfit_up : e.type === "outfit_down" ? SIGNAL.outfit_down : e.type === "scroll_past" ? SIGNAL.scroll_past
    : e.type === "dwell_ms" ? Math.min(SIGNAL.dwellMax, ((e.dwell_ms ?? 0) / 8000) * SIGNAL.dwellMax) * ((e.dwell_ms ?? 0) >= 3000 ? 1 : 0) : 0;
  if (outfitW) { for (const p of e.pieces) addPiece(t, p, outfitW * 0.5); addConnections(t, e.pieces, outfitW); }
  if ((e.type === "like" || e.type === "tap_product" || e.type === "view_product_click") && e.piece) {
    const w = SIGNAL[e.type]; addPiece(t, e.piece, w);
    if (e.type === "like") addConnections(t, e.pieces, w * 0.6);        // a liked piece also says its combination worked
  }
  if (e.type === "swap") {
    if (e.out && (e.alt ?? 0) > 0) addPiece(t, e.out, SIGNAL.swapOut);                  // replaced piece: weak negative
    if (e.into) addPiece(t, e.into, (e.alt ?? 0) === 0 ? SIGNAL.swapBack : SIGNAL.swapIn);   // back to the original: positive for it
  }
  return t;
}

const cos = (a: Float32Array, b: ArrayLike<number>) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < D; i++) { const x = Math.max(0, a[i]); d += x * b[i]; na += x * x; nb += b[i] * b[i]; } return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0; };
/** how well a piece matches the device's taste for its slot, 0..1 (0.5 neutral when there is no history) */
export const tasteMatch = (t: Taste | null, p: CatPiece): number => (!t || t.n < 5 ? 0.5 : cos(t.styles[slotOf(p)], p.vec));
/** connection bonus -1..1 for placing b next to a (top-bottom or bottom-shoes), from the learned style x style matrices + formality gap + category pair */
export function connBonus(t: Taste | null, a: CatPiece, b: CatPiece): number {
  if (!t || t.n < 20) return 0;
  const m = a.slot === "bottom" || (a.slot === "top" && b.slot === "shoes") ? t.bs : t.tb; let raw = 0, tot = 1e-6;
  const [x, y] = a.slot === "bottom" && b.slot === "top" ? [b, a] : [a, b];
  for (let i = 0; i < D; i++) { const xi = x.vec[i]; if (xi < 0.05) continue; for (let j = 0; j < D; j++) { raw += xi * y.vec[j] * m[i * D + j]; } }
  for (let k = 0; k < m.length; k++) tot += Math.abs(m[k]);
  let c = Math.tanh((raw / tot) * 12);
  if (x.slot === "top" && y.slot === "bottom") { const gb = Math.min(4, Math.floor(Math.abs(x.formality - y.formality) * 5)); const ft = t.fgap.reduce((s, v) => s + Math.abs(v), 1e-6); c += 0.3 * Math.tanh((t.fgap[gb] / ft) * 4 - 0.2); }
  return Math.max(-1, Math.min(1, c));
}
/** size on disk (what one device row would hold) */
export const tasteBytes = (t: Taste) => 4 * (3 * D + 2 * D * D + 5 + 64) + 300;
