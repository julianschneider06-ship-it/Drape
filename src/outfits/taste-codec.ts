// Taste transport (server only): compact binary encoding of a Taste (deflate + base64, held by the client) and the compact "signal" format of the
// client's outbox (the same events that go to the event log, reduced to what the taste needs). Signals are turned into TasteEvents with the
// in-memory catalogue (style vectors, attributes) and applied with the shared pure applyEvent.
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { Catalogue, CatPiece } from "./catalogue";
import { applyEvent, newTaste, type EventTags, type Taste, type TasteEvent, type TasteEventType } from "./taste";

const D = 24;
/** one outbox entry: t = type, p = product, o = the outfit's main pieces as shown, d = dwell ms, x / i = swapped out / in, a / f = loop position after / before,
 *  pv = previous reaction (outfit_clear), tg = compact outfit tags, b = keep boost, at = client time ms */
export interface Signal { t: TasteEventType; p?: number; o?: number[]; d?: number; x?: number; i?: number; a?: number; f?: number; pv?: "up" | "down"; tg?: EventTags | null; b?: number; at?: number }
const TYPES = new Set<TasteEventType>(["like", "unlike", "tap_product", "view_product_click", "scroll_past", "outfit_up", "outfit_down", "outfit_clear", "dwell_ms", "swap", "keep"]);

export function encodeTaste(t: Taste): string {
  const head = Buffer.from(JSON.stringify({ v: t.v, n: t.n, f: +t.formality.toFixed(4), b: +t.boldness.toFixed(4), c: t.colours, s: t.silhouettes, k: t.categories, g: t.tags, cn: t.counts, l: t.lastEventId, u: t.updatedAt }, (_, v) => (typeof v === "number" ? +v.toFixed(4) : v)));
  // float arrays quantized to int16 with one float32 scale per array (precision 1/32767 of the array's max: plenty for preferences), then deflate
  const arrs = [t.styles.top, t.styles.bottom, t.styles.shoes, t.tb, t.bs, t.fgap, t.catPair];
  const body = Buffer.alloc(arrs.reduce((a, x) => a + 4 + 2 * x.length, 0)); let o = 0;
  for (const a of arrs) { let mx = 0; for (const v of a) mx = Math.max(mx, Math.abs(v)); const sc = mx / 32767 || 1; body.writeFloatLE(sc, o); o += 4; for (const v of a) { body.writeInt16LE(Math.round(v / sc), o); o += 2; } }
  const len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  return deflateRawSync(Buffer.concat([len, head, body]), { level: 6 }).toString("base64");
}
export function decodeTaste(b64: string | null | undefined): Taste | null {
  if (!b64 || b64.length > 40_000 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  try {
    const buf = inflateRawSync(Buffer.from(b64, "base64"), { maxOutputLength: 64_000 });
    const hl = buf.readUInt32LE(0), h = JSON.parse(buf.subarray(4, 4 + hl).toString());
    if (h.v !== 2) return null;
    const sizes = [D, D, D, D * D, D * D, 5, 64]; let o = 4 + hl;
    if (buf.length !== o + sizes.reduce((a, n) => a + 4 + 2 * n, 0)) return null;
    const arrs = sizes.map((n) => { const sc = buf.readFloatLE(o); o += 4; const a = new Float32Array(n); for (let i = 0; i < n; i++) { a[i] = buf.readInt16LE(o) * (Number.isFinite(sc) ? sc : 0); o += 2; } return a; });
    const t = newTaste();
    t.styles = { top: arrs[0], bottom: arrs[1], shoes: arrs[2] }; t.tb = arrs[3]; t.bs = arrs[4]; t.fgap = arrs[5]; t.catPair = arrs[6];
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d), dict = (x: unknown) => (x && typeof x === "object" ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => typeof v === "number" && Number.isFinite(v)).slice(0, 80)) as Record<string, number> : {});
    Object.assign(t, { n: Math.max(0, num(h.n, 0)), formality: num(h.f, 0.4), boldness: num(h.b, 0.3), colours: dict(h.c), silhouettes: dict(h.s), categories: dict(h.k), tags: dict(h.g), counts: dict(h.cn), lastEventId: num(h.l, 0), updatedAt: num(h.u, 0) });
    return t;
  } catch { return null; }
}

/** validate the outbox sent by the browser (it is user input: only known types, numbers and short strings survive) */
export function cleanSignals(x: unknown, max = 80): Signal[] {
  if (!Array.isArray(x)) return [];
  const int = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 && (v as number) < 2 ** 31 ? (v as number) : undefined);
  const out: Signal[] = [];
  for (const r of x.slice(-max)) {
    if (!r || typeof r !== "object") continue; const s = r as Record<string, unknown>;
    if (!TYPES.has(s.t as TasteEventType)) continue;
    const tg = s.tg && typeof s.tg === "object" ? Object.fromEntries(Object.entries(s.tg as Record<string, unknown>).filter(([k, v]) => ["se", "oc", "pk", "si", "fo", "w"].includes(k) && typeof v === "string" && v.length < 24 || k === "ct" && typeof v === "number")) as EventTags : null;
    out.push({ t: s.t as TasteEventType, p: int(s.p), o: Array.isArray(s.o) ? (s.o as unknown[]).map(int).filter((v): v is number => !!v).slice(0, 4) : undefined, d: typeof s.d === "number" && s.d >= 0 ? Math.min(s.d, 600_000) : undefined,
      x: int(s.x), i: int(s.i), a: Number.isInteger(s.a) ? Math.max(0, Math.min(2, s.a as number)) : undefined, f: Number.isInteger(s.f) ? Math.max(0, Math.min(2, s.f as number)) : undefined,
      pv: s.pv === "up" || s.pv === "down" ? s.pv : undefined, tg, b: typeof s.b === "number" ? Math.max(1, Math.min(3, s.b)) : undefined, at: typeof s.at === "number" ? s.at : undefined });
  }
  return out;
}

/** signals -> taste events with the catalogue's piece attributes (unknown products are skipped: sold out, accessory, other gender) */
export function signalToEvent(cat: Catalogue, s: Signal): TasteEvent | null {
  const pc = (id?: number) => (id ? cat.byId.get(id) : undefined);
  const pieces = (s.o ?? []).map(pc).filter((p): p is CatPiece => !!p);
  const e: TasteEvent = { type: s.t, pieces, piece: pc(s.p), dwell_ms: s.d, out: pc(s.x), into: pc(s.i), alt: s.a, from: s.f, prev: s.pv, tags: s.tg ?? null, boost: s.b, at: s.at };
  if (["like", "unlike", "tap_product", "view_product_click", "keep"].includes(s.t) && !e.piece) return null;
  if (["outfit_up", "outfit_down", "outfit_clear", "dwell_ms", "scroll_past"].includes(s.t) && !pieces.length) return null;
  if (s.t === "swap" && !e.out && !e.into) return null;
  return e;
}
export function applySignals(cat: Catalogue, t: Taste, signals: Signal[]): { taste: Taste; applied: number; skipped: number } {
  let applied = 0, skipped = 0;
  for (const s of signals) { const e = signalToEvent(cat, s); if (!e) { skipped++; continue; } applyEvent(t, e); applied++; }
  return { taste: t, applied, skipped };
}

/** event-log rows (events_for_device) -> signals: the event log is the source of truth; replaying it rebuilds the client-held taste (login / new device / sync).
 *  "keep" is derived like on the client: a piece that was swapped in and is still on screen when the user leaves the outfit (dwell event) counts as kept. */
export interface EventRow { id: number; t: string; p: number | null; o: number[] | null; out: number | null; d: number | null; ctx: Record<string, unknown> | null; at: string }
export function eventsToSignals(rows: EventRow[]): Signal[] {
  const out: Signal[] = [], swappedIn = new Map<number, Set<number>>();
  const tg = (c: Record<string, unknown> | null) => { const t = c?.tags as Record<string, unknown> | undefined; if (!t) return null; const { se, oc, pk, si, fo, w, ct } = t; return { se, oc, pk, si, fo, w, ct } as EventTags; };
  for (const r of rows) {
    const at = Date.parse(r.at), o = r.o ?? undefined, c = r.ctx ?? {};
    switch (r.t) {
      case "like": case "unlike": case "tap_product": case "view_product_click": if (r.p) out.push({ t: r.t, p: r.p, o, tg: tg(c), at }); break;
      case "outfit_up": case "outfit_down": out.push({ t: r.t, o, tg: tg(c), at }); break;
      case "outfit_clear": out.push({ t: "outfit_clear", o, pv: c.prev === "up" || c.prev === "down" ? c.prev : undefined, tg: tg(c), at }); break;
      case "scroll_past": out.push({ t: "scroll_past", o, tg: tg(c), at }); break;
      case "swap": {
        out.push({ t: "swap", x: typeof c.out === "number" ? c.out : undefined, i: r.p ?? undefined, a: typeof c.alt === "number" ? c.alt : undefined, f: typeof c.from === "number" ? c.from : undefined, at });
        if (r.out && r.p) { const s = swappedIn.get(r.out) ?? new Set<number>(); s.add(r.p); swappedIn.set(r.out, s); }
        break;
      }
      case "dwell_ms": {
        out.push({ t: "dwell_ms", o, d: r.d ?? 0, tg: tg(c), at });
        const s = r.out ? swappedIn.get(r.out) : undefined;
        if (s && o) for (const id of o) if (s.has(id)) out.push({ t: "keep", p: id, o, b: (r.d ?? 0) >= 8000 ? 2 : 1, at });
        break;
      }
    }
  }
  return cleanSignals(out, 100000);
}
