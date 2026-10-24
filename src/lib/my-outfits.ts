// Pure logic of Wishlist > My Outfits (no I/O): slot rules, editing, the saved shape and its storage parsing. Numbers and texts live in src/config/my-outfits.ts.
import { MY_OUTFITS_FIRST_ACC_SLOTS, MY_OUTFITS_FULL_SLOT, MY_OUTFITS_MAX_ACCESSORY_SLOTS, MY_OUTFITS_MAX_SAVED, MY_OUTFITS_SLOTS, MY_OUTFITS_ACC, type MainSlot } from "@/config/my-outfits";
import { groupOf } from "@/lib/likes-filter";
import type { FeedCard } from "@/lib/types";

/** the editor state: one id per main slot (or null) and the accessory slots in order (null = empty slot) */
export interface Draft { top: number | null; bottom: number | null; shoes: number | null; acc: (number | null)[] }
/** what is saved on the device: product ids and slot order only (empty accessory slots are not saved) */
export interface SavedOutfit { id: string; top: number | null; bottom: number | null; shoes: number | null; acc: number[] }
export interface Store { v: 1; outfits: SavedOutfit[] }
export type SlotRef = MainSlot | { acc: number };

export const emptyStore = (): Store => ({ v: 1, outfits: [] });
export const emptyDraft = (): Draft => ({ top: null, bottom: null, shoes: null, acc: Array.from({ length: MY_OUTFITS_FIRST_ACC_SLOTS }, () => null) });

export const isOnePiece = (c: { slot: string } | null | undefined) => c?.slot === MY_OUTFITS_FULL_SLOT;
export const idsOf = (d: Draft): number[] => [d.top, d.bottom, d.shoes, ...d.acc].filter((x): x is number => x !== null);
export const filledCount = (d: Draft) => idsOf(d).length;
export const canSave = (d: Draft) => filledCount(d) >= 1;
export const canAddAcc = (d: Draft, max = MY_OUTFITS_MAX_ACCESSORY_SLOTS) => d.acc.length < max;
export const canRemoveAcc = (d: Draft, i: number) => d.acc.length > 1 && d.acc[i] === null;   // only an empty extra slot; the first slot stays

/** does a liked product fit this slot (same grouping as the Wishlist type filter) */
export function fitsSlot(slot: SlotRef, card: { slot: string }): boolean {
  const groups = typeof slot === "string" ? MY_OUTFITS_SLOTS.find((s) => s.id === slot)?.groups : MY_OUTFITS_ACC.groups;
  return !!groups?.includes(groupOf(card.slot));
}
export const idAt = (d: Draft, slot: SlotRef): number | null => (typeof slot === "string" ? d[slot] : d.acc[slot.acc] ?? null);

/** liked products the picker lists for a slot: matching category only, and nothing that already sits in another slot of this outfit (the slot's own piece stays listed) */
export function pickerItems<T extends { id: number; slot: string }>(liked: T[], d: Draft, slot: SlotRef): T[] {
  const own = idAt(d, slot), used = new Set(idsOf(d));
  return liked.filter((c) => fitsSlot(slot, c) && (c.id === own || !used.has(c.id)));
}

/** put a product into a slot (null clears it). The same product never sits in two slots (the draft is returned unchanged); a one-piece in Top empties Bottom. */
export function setSlot(d: Draft, slot: SlotRef, card: FeedCard | null): Draft {
  const id = card ? card.id : null;
  if (id !== null && idsOf(d).includes(id) && idAt(d, slot) !== id) return d;
  if (card && !fitsSlot(slot, card)) return d;
  if (typeof slot !== "string") return { ...d, acc: d.acc.map((x, i) => (i === slot.acc ? id : x)) };
  const n = { ...d, [slot]: id } as Draft;
  if (slot === "top" && isOnePiece(card)) n.bottom = null;
  return n;
}
export const addAccSlot = (d: Draft, max = MY_OUTFITS_MAX_ACCESSORY_SLOTS): Draft => (canAddAcc(d, max) ? { ...d, acc: [...d.acc, null] } : d);
export const removeAccSlot = (d: Draft, i: number): Draft => (canRemoveAcc(d, i) ? { ...d, acc: d.acc.filter((_, k) => k !== i) } : d);

/** the Bottom slot is locked while the Top is a one-piece garment */
export const bottomLocked = (topCard: { slot: string } | null | undefined) => isOnePiece(topCard);

export function toSaved(d: Draft, id: string): SavedOutfit { return { id, top: d.top, bottom: d.bottom, shoes: d.shoes, acc: d.acc.filter((x): x is number => x !== null) }; }
/** back into the editor: filled accessories first, then at least one slot, one extra empty slot is not added */
export function fromSaved(s: SavedOutfit): Draft {
  const acc: (number | null)[] = s.acc.slice(0, MY_OUTFITS_MAX_ACCESSORY_SLOTS);
  while (acc.length < MY_OUTFITS_FIRST_ACC_SLOTS) acc.push(null);
  return { top: s.top, bottom: s.bottom, shoes: s.shoes, acc };
}

const posInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
/** read the stored JSON; anything malformed is dropped (an unknown / broken store gives an empty one) */
export function parseStore(raw: string | null | undefined): Store {
  if (!raw) return emptyStore();
  try {
    const j = JSON.parse(raw) as { v?: unknown; outfits?: unknown };
    if (j?.v !== 1 || !Array.isArray(j.outfits)) return emptyStore();
    const outfits: SavedOutfit[] = [];
    for (const o of j.outfits as Record<string, unknown>[]) {
      if (!o || typeof o.id !== "string" || !o.id) continue;
      const one = (v: unknown) => (posInt(v) ? v : null);
      const seen = new Set<number>(), take = (v: number | null) => { if (v === null || seen.has(v)) return null; seen.add(v); return v; };
      const s: SavedOutfit = { id: o.id, top: take(one(o.top)), bottom: take(one(o.bottom)), shoes: take(one(o.shoes)), acc: [] };
      if (Array.isArray(o.acc)) for (const a of o.acc) { const x = take(one(a)); if (x !== null && s.acc.length < MY_OUTFITS_MAX_ACCESSORY_SLOTS) s.acc.push(x); }
      if (s.top !== null || s.bottom !== null || s.shoes !== null || s.acc.length) outfits.push(s);
      if (outfits.length >= MY_OUTFITS_MAX_SAVED) break;
    }
    return { v: 1, outfits };
  } catch { return emptyStore(); }
}
export const serializeStore = (s: Store) => JSON.stringify(s);

export const storeFull = (s: Store, max = MY_OUTFITS_MAX_SAVED) => s.outfits.length >= max;
/** save: replaces an outfit with the same id (edit) or adds a new one at the top; a new one over the limit is refused (null) */
export function saveOutfit(s: Store, o: SavedOutfit, max = MY_OUTFITS_MAX_SAVED): Store | null {
  const i = s.outfits.findIndex((x) => x.id === o.id);
  if (i >= 0) return { v: 1, outfits: s.outfits.map((x, k) => (k === i ? o : x)) };
  if (s.outfits.length >= max) return null;
  return { v: 1, outfits: [o, ...s.outfits] };
}
export const deleteOutfit = (s: Store, id: string): Store => ({ v: 1, outfits: s.outfits.filter((o) => o.id !== id) });
export const newOutfitId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Unliked products stay in a saved outfit and are shown grey (Generate Outfits rule): liked right now = colour. */
export const isGreyId = (id: number | undefined, liked: ReadonlySet<number>) => !(id !== undefined && liked.has(id));

/** A missing main piece (empty slot, or a product that no longer exists) is drawn as blank space: the layout reserves its place, the canvas paints nothing (negative id). */
export const blankCard = (slot: "top" | "bottom" | "shoes", n = 0): FeedCard => ({ id: -(n * 3 + (slot === "top" ? 1 : slot === "bottom" ? 2 : 3)), brand: "", name: "", slot, image: "", bg: null, whiten: null, bbox: null, aspect: null, price_cents: null, compare_at_cents: null, currency: null, url: "", store: "", in_stock: true });
export const isBlankId = (id: number) => id < 0;
