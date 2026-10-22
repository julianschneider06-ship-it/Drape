// Server side of the dynamic feed prototype (?feed=dynamic): catalogue cache per instance, ban list store, starter set, page composition.
// Nothing here touches outfit_pool or the default feed.
import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after } from "next/server";
import { BanState } from "@/outfits/ban";
import { catalogueLoad, getCatalogue, type Catalogue } from "@/outfits/catalogue";
import { compose, newSession, type ComposedOutfit, type Session } from "@/outfits/compose";
import { alternativesFor } from "@/outfits/compose-alts";
import { subGroup } from "@/outfits/compose-polish";
import { outfitTags } from "@/outfits/tags";
import { applySignals, decodeTaste, encodeTaste, type Signal } from "@/outfits/taste-codec";
import { newTaste } from "@/outfits/taste";
import { mixFor, TASTE } from "@/lib/personalization/config";
import { makeRnd } from "@/outfits/pool-shared";
import { gatewayRpc } from "@/lib/gateway";
import type { FeedAccessory, FeedAlt, FeedCard, FeedOutfit } from "@/lib/types";

const defer = (p: Promise<unknown>) => { try { after(() => p); } catch { void p; } };   // background refresh after the response (outside a request the promise just runs)
export const getCat = (g: "women" | "men"): Promise<Catalogue> => getCatalogue((known) => gatewayRpc("snapshot_get", { p_known_version: known }), g, 5 * 60_000, defer);

export async function readBan(device: string): Promise<BanState> { return BanState.fromBase64(await gatewayRpc<string | null>("ban_get", { p_device: device })); }
export async function writeBan(device: string, ban: BanState) { await gatewayRpc("ban_put", { p_device: device, p_b64: ban.toBase64() }, { retry: false }); }

interface CardRow { id: number; card?: FeedCard; acc?: { type: string | null; size: string | null; front_flat: boolean | null; belt_shape: string | null } }
export async function cardsFor(ids: number[], cat?: Catalogue): Promise<Map<number, CardRow>> {
  const out = new Map<number, CardRow>(); let uniq = [...new Set(ids)];
  if (cat) {   // cards from the in-memory catalogue (no round trip); only ids without a catalogue card go to the database
    uniq = uniq.filter((id) => { const p = cat.byId.get(id), a = cat.accById.get(id); const c = (p?.card ?? a?.card) as FeedCard | undefined; if (!c) return true; out.set(id, { id, card: c, ...(a ? { acc: { type: a.type, size: a.size, front_flat: a.frontFlat, belt_shape: a.beltShape } } : {}) }); return false; });
  }
  for (let i = 0; i < uniq.length; i += 150) for (const r of await gatewayRpc<CardRow[]>("cards_by_ids", { p_ids: uniq.slice(i, i + 150) })) out.set(r.id, r);
  return out;
}

interface StarterRow { ord: number; kind: "three" | "full"; piece_ids: number[]; acc_ids: number[]; score: number; style: string; contrast: boolean; hash: number }
const starterCache = new Map<string, { at: number; rows: StarterRow[] }>(); const starterInflight = new Map<string, Promise<StarterRow[]>>();
function bundledStarter(g: string): StarterRow[] | null { try { return JSON.parse(readFileSync(join(process.cwd(), "src", "generated", `starter.${g}.json`), "utf8")) as StarterRow[]; } catch { return null; } }
/** starter rows: the copy bundled with the deployment first (a cold instance must not wait for a database round trip: it cost 450 ms), refreshed in the background every 10 minutes */
export async function starterRows(g: string): Promise<StarterRow[]> {
  const c = starterCache.get(g);
  const refresh = () => { let p = starterInflight.get(g); if (!p) { p = gatewayRpc<StarterRow[]>("starter_list", { p_gender: g }).then((rows) => { starterCache.set(g, { at: Date.now(), rows }); return rows; }).finally(() => starterInflight.delete(g)); starterInflight.set(g, p); } return p; };
  if (c && Date.now() - c.at < 10 * 60_000) return c.rows;
  if (c) { defer(refresh().catch(() => c.rows)); return c.rows; }
  const b = bundledStarter(g);
  if (b) { starterCache.set(g, { at: Date.now() - 9 * 60_000, rows: b }); return b; }   // one minute later the first request refreshes it in the background
  return refresh();
}

/** composed outfits (+ their 2 alternatives per piece) -> the same shape the feed UI already renders */
export async function toFeedOutfits(cat: Catalogue, g: "women" | "men", outs: ComposedOutfit[], alts: Record<string, number[]>[], orderBase: number): Promise<FeedOutfit[]> {
  const ids = [...outs.flatMap((o) => [...o.ids, ...o.acc.map((a) => a.id)]), ...alts.flatMap((a) => Object.values(a).flat())];
  const cards = await cardsFor(ids, cat);
  const card = (id: number) => cards.get(id)?.card;
  const res: FeedOutfit[] = [];
  outs.forEach((o, i) => {
    const mains = o.ids.map(card); if (mains.some((c) => !c)) return;
    const full = o.kind === "full";
    const accessories: FeedAccessory[] = o.acc.flatMap((a, k) => { const c = card(a.id), m = cards.get(a.id)?.acc; return c ? [{ card: c, type: a.type, placement: a.placement as FeedAccessory["placement"], zone: a.zone, size: m?.size ?? null, front_flat: m?.front_flat ?? null, belt_shape: m?.belt_shape ?? null, slot_no: k + 1 }] : []; });
    const altOut: Record<string, FeedAlt[]> = {};
    for (const [key, list] of Object.entries(alts[i] ?? {})) {
      const a = list.flatMap((id, r) => { const c = card(id); const m = cards.get(id)?.acc; return c ? [{ rank: r + 1, card: c, ...(key.startsWith("acc") && m ? { meta: m } : {}) } as FeedAlt] : []; });
      if (a.length) altOut[key] = a;
    }
    const first = cat.byId.get(o.ids[0])!;
    const tags = outfitTags(cat, { pieces: o.ids.map((id) => cat.byId.get(id)!), accs: o.acc.map((a) => cat.accById.get(a.id)!).filter(Boolean), bucket: o.bucket, pattern: o.pattern });
    res.push({ tags, id: o.hash, kind: o.kind, score: o.score, order: orderBase + i, top: mains[0]!, bottom: full ? null : mains[1]!, shoes: mains[mains.length - 1]!, accessories, alts: altOut,
      dyn: { style: o.style, store: first.store, season: o.season.season, fit: o.season.fit, bucket: o.bucket, pattern: o.pattern, ids: [...o.ids, ...o.acc.map((a) => a.id)] } });
  });
  return res;
}

export interface PageInput { banB64?: string | null; device: string; gender: "women" | "men"; recent?: { ids: number[]; style: string; store: string }[]; startersServed?: number; persona?: string | null; contrast?: number;
  /** hybrid: the client-held taste (base64) and the signals since the last page; null / undefined = plain composer without taste */
  taste?: string | null; signals?: Signal[]; hybrid?: boolean }
export interface TasteOut { taste: string; n: number; personalized: boolean; applied: number; skipped: number; bytes: number; thin: string[]; mix: Record<string, number> }
export async function dynamicPage(inp: PageInput): Promise<{ ban: string; items: FeedOutfit[]; ms: { total: number; ban: number; compose: number; cards: number; write: number; taste?: number; cat?: typeof catalogueLoad & { coldMs: number }; up?: number }; taste?: TasteOut }> {
  const t0 = performance.now(); const countBefore = catalogueLoad.count; const cat = await getCat(inp.gender); const tCat = performance.now() - t0;
  const tb = performance.now(); const ban = inp.banB64 !== undefined && inp.banB64 !== null ? BanState.fromBase64(inp.banB64) : await readBan(inp.device);   // client-held ban list (no storage round trip) or the database copy
  if (inp.startersServed && inp.startersServed > 0) {            // first dynamic page after the starter set: the starter pieces are banned too
    const rows = (await starterRows(inp.gender)).slice(0, inp.startersServed); ban.push(rows.flatMap((r) => [...r.piece_ids, ...r.acc_ids]));
  }
  const session: Session = newSession();
  for (const r of inp.recent ?? []) session.guard.push(r.ids, r.style, r.store);
  for (const r of inp.recent ?? []) for (const id of r.ids) session.uses.set(id, (session.uses.get(id) ?? 0) + 1);
  for (const r of inp.recent ?? []) for (const id of r.ids) { const p = cat.byId.get(id); if (p && (p.slot === "top" || p.slot === "bottom")) session.subs[p.slot].push(subGroup(p)); }
  // hybrid: decode the client-held taste, apply the signals collected since the last page with the shared pure update, compose with it
  let taste = null as ReturnType<typeof decodeTaste>, tasteOut: TasteOut | undefined, tt = 0;
  if (inp.hybrid) {
    const t0t = performance.now();
    taste = decodeTaste(inp.taste) ?? newTaste();
    const r = applySignals(cat, taste, inp.signals ?? []);
    tt = performance.now() - t0t;
    tasteOut = { taste: "", n: taste.n, personalized: taste.n >= TASTE.personalizeFrom, applied: r.applied, skipped: r.skipped, bytes: 0, thin: [], mix: mixFor(taste.n) };
  }
  const tc = performance.now();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const { outfits, ban: ban2, stats } = compose(cat, { gender: inp.gender, taste, ...(inp.contrast ? { mix: { match: 0, near: 0, new: 1 - inp.contrast, contrast: inp.contrast } } : {}) }, ban, 6, session, makeRnd(seed));
  const eff = ban2.effective(cat, inp.gender);
  const alts = outfits.map((o) => alternativesFor(cat, inp.gender, o, eff, taste));
  if (tasteOut && taste) { const t1 = performance.now(); tasteOut.taste = encodeTaste(taste); tasteOut.bytes = tasteOut.taste.length; tasteOut.thin = stats.thin ?? []; tt += performance.now() - t1; }
  const tk = performance.now();
  const items = await toFeedOutfits(cat, inp.gender, outfits, alts, 0);
  const te = performance.now();
  const tw = performance.now();
  if (inp.banB64 === undefined || inp.banB64 === null) await writeBan(inp.device, ban2);
  return { ban: ban2.toBase64(), items, ms: { total: performance.now() - t0, ban: tc - tb, compose: tk - tc, cards: te - tk, write: performance.now() - tw, taste: tt, up: process.uptime(), cat: { ...catalogueLoad, coldMs: tCat, ...(catalogueLoad.count === countBefore ? { fetchMs: 0, unpackMs: 0, buildMs: 0 } : {}) } }, taste: tasteOut };
}

export async function starterPage(g: "women" | "men", page: number): Promise<FeedOutfit[]> {
  const cat = await getCat(g); const rows = (await starterRows(g)).slice(page * 6, page * 6 + 6);
  if (!rows.length) return [];
  const { composedFromRow } = await import("@/outfits/starter");
  const outs = rows.filter((r) => r.piece_ids.every((id) => cat.byId.has(id))).map((r) => composedFromRow(cat, r));   // a starter piece that left the catalogue (out of stock) drops its outfit
  const ban = new BanState(); const eff = ban.effective(cat, g);
  return toFeedOutfits(cat, g, outs, outs.map((o) => alternativesFor(cat, g, o, eff)), page * 6);
}
