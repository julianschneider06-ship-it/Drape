// In-memory catalogue for the dynamic composer: all feed-ready pieces and accessories in compact typed arrays, with indexes by
// (gender, slot, season). Built from a snapshot (one gzip+base64 blob produced by scripts/build-catalogue.ts), cached per function
// instance and refreshed when the version stamp changes. See docs/architecture.md ("Dynamic composer spike") for the scale path.
import { gunzipSync, gzipSync } from "node:zlib";
import { STYLE_KEYS } from "../classify/styles";
import { toAcc, type Acc, type RawAcc } from "./accessories";
import { toPiece, type Piece, type RawPiece, type Slot } from "./score";

/** classification row (outfit_inputs) + composer extras (composer_inputs) of one main piece */
export interface RawCatPiece extends RawPiece {
  brand: string; aspect: number; hem: number | null; waist: number | null; collar: number | null; hood: boolean | null; fill: number | null; presentation: string | null;
  cutout?: string; image?: string; url?: string; price_cents?: number | null; compare_at_cents?: number | null; currency?: string | null;   // display fields of the feed card
}
export interface RawCatAcc extends RawAcc { brand: string; aspect: number; cutout?: string; image?: string; url?: string; price_cents?: number | null; compare_at_cents?: number | null; currency?: string | null }
export interface Snapshot { version: string; pieces: RawCatPiece[]; accs: RawCatAcc[] }

export interface CatPiece extends Piece {
  idx: number; brand: string; name: string; aspect: number; hem: number | null; waist: number | null; collar: number | null; hood: boolean | null;
  fill: number | null; presentation: string | null; colors: string[]; silhouette: string; fit: string; material: string | null; boldness: number;
  card?: Record<string, unknown>;   // feed card built from the snapshot (no DB round trip per page)
  short: boolean;   // shorts / short skirt (bottom length class: decides which shoes look right, same rule as the alternatives job)
}
export interface CatAcc extends Acc { brand: string; name: string; aspect: number; idx: number; size: string | null; card?: Record<string, unknown> }

const SLOT_ID: Record<Slot, number> = { top: 0, bottom: 1, shoes: 2, full_body: 3 };
const SHORT = /\b(shorts?|skort|mini|bermuda)\b/i;
const SEASON_BITS = [1, 2, 4, 8];   // spring, summer, autumn, winter

export interface Catalogue {
  version: string;
  pieces: CatPiece[]; byId: Map<number, CatPiece>;
  accs: CatAcc[]; accById: Map<number, CatAcc>;
  /** columns (typed arrays, index = piece idx) */
  vecs: Float32Array; formality: Float32Array; boldness: Float32Array; statement: Float32Array; mask: Uint8Array; slotId: Uint8Array; genderMask: Uint8Array;
  /** index lists: `${gender}:${slot}` and `${gender}:${slot}:${season 0..3}` -> piece idx */
  index: Map<string, Int32Array>;
  groupSize: Map<string, number>;   // ban-limit groups: `${gender}:${slot}` and `${gender}:acc:${type}`
  loadedAt: number;
}

/** feed card (same shape as product_card) from snapshot fields; the original-image fallback fields (bbox, bg) are left out: the dynamic feed shows cutouts */
function cardOf(r: { id: number; brand: string; name?: string | null; store: string; aspect: number; hem?: number | null; waist?: number | null; collar?: number | null; hood?: boolean | null; fill?: number | null; presentation?: string | null; cutout?: string; image?: string; url?: string; price_cents?: number | null; compare_at_cents?: number | null; currency?: string | null }, slot: string): Record<string, unknown> | undefined {
  if (!r.cutout) return undefined;
  return { id: r.id, brand: r.brand, name: r.name ?? "", slot, image: r.image, cutout: r.cutout, cutout_aspect: r.aspect, presentation: r.presentation, hem: r.hem, waist: r.waist, collar: r.collar, hood: r.hood, fill: r.fill, price_cents: r.price_cents, compare_at_cents: r.compare_at_cents, currency: r.currency, url: r.url, store: r.store, in_stock: true };
}

export function buildCatalogue(snap: Snapshot): Catalogue {
  const raw = snap.pieces.filter((r) => toPiece(r)); // toPiece drops excluded categories (underwear, ...)
  const n = raw.length, D = STYLE_KEYS.length;
  const vecs = new Float32Array(n * D), formality = new Float32Array(n), boldness = new Float32Array(n), statement = new Float32Array(n);
  const mask = new Uint8Array(n), slotId = new Uint8Array(n), genderMask = new Uint8Array(n);
  const pieces: CatPiece[] = [], byId = new Map<number, CatPiece>();
  raw.forEach((r, i) => {
    const p = toPiece(r)!;
    vecs.set(p.vec, i * D); p.vec = vecs.subarray(i * D, (i + 1) * D);   // share one buffer
    formality[i] = p.formality; boldness[i] = r.boldness ?? 0.3; statement[i] = p.statement; mask[i] = p.mask; slotId[i] = SLOT_ID[p.slot];
    genderMask[i] = (p.genders.includes("women") ? 1 : 0) | (p.genders.includes("men") ? 2 : 0);
    const cp: CatPiece = { ...p, idx: i, brand: r.brand, name: r.name ?? "", aspect: r.aspect, hem: r.hem, waist: r.waist, collar: r.collar, hood: r.hood, fill: r.fill, presentation: r.presentation,
      card: cardOf(r, p.slot === "full_body" ? "full_body" : p.slot),
      colors: r.colors ?? [], silhouette: r.silhouette ?? "", fit: r.fit ?? "", material: r.material ?? null, boldness: r.boldness ?? 0.3, short: p.slot === "bottom" && SHORT.test(`${r.name ?? ""} ${r.sub ?? ""}`) };
    pieces.push(cp); byId.set(cp.id, cp);
  });
  const buckets = new Map<string, number[]>();
  const push = (k: string, i: number) => { const l = buckets.get(k); if (l) l.push(i); else buckets.set(k, [i]); };
  const slots = Object.keys(SLOT_ID) as Slot[];
  pieces.forEach((p, i) => {
    for (const g of ["women", "men"] as const) if (p.genders.includes(g)) {
      push(`${g}:${p.slot}`, i);
      const m = p.mask || 15;
      SEASON_BITS.forEach((b, s) => { if (m & b) push(`${g}:${p.slot}:${s}`, i); });
    }
  });
  const index = new Map<string, Int32Array>(); for (const [k, l] of buckets) index.set(k, Int32Array.from(l));
  const groupSize = new Map<string, number>();
  for (const g of ["women", "men"]) for (const s of slots) groupSize.set(`${g}:${s}`, index.get(`${g}:${s}`)?.length ?? 0);
  const accs: CatAcc[] = [], accById = new Map<number, CatAcc>();
  snap.accs.forEach((r, i) => { const a = toAcc(r); const ca: CatAcc = { ...a, brand: r.brand, name: r.name, aspect: r.aspect, idx: i, size: r.size ?? null, card: cardOf(r, "accessory") }; accs.push(ca); accById.set(ca.id, ca);
    for (const g of a.genders) groupSize.set(`${g}:acc:${a.type}`, (groupSize.get(`${g}:acc:${a.type}`) ?? 0) + 1); });
  return { version: snap.version, pieces, byId, accs, accById, vecs, formality, boldness, statement, mask, slotId, genderMask, index, groupSize, loadedAt: Date.now() };
}

/** snapshot <-> gzip+base64 text (what is stored in catalogue_snapshot.data) */
export const packSnapshot = (s: Snapshot) => gzipSync(Buffer.from(JSON.stringify(s)), { level: 9 }).toString("base64");
export const unpackSnapshot = (b64: string): Snapshot => JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));

/** Per function instance cache with a version stamp: a cheap `snapshot_get(version)` call answers "unchanged" without sending the blob. */
let cached: Catalogue | null = null; let checkedAt = 0;
export async function getCatalogue(fetchSnapshot: (known: string | null) => Promise<{ version: string; unchanged?: boolean; data?: string } | null>, maxAgeMs = 5 * 60_000): Promise<Catalogue> {
  if (cached && Date.now() - checkedAt < maxAgeMs) return cached;
  const r = await fetchSnapshot(cached?.version ?? null);
  checkedAt = Date.now();
  if (!r) { if (cached) return cached; throw new Error("no catalogue snapshot"); }
  if (r.unchanged && cached) return cached;
  cached = buildCatalogue(unpackSnapshot(r.data!));
  return cached;
}
export const _resetCatalogueCache = () => { cached = null; checkedAt = 0; };
