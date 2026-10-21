// Server side of the dynamic feed prototype (?feed=dynamic): catalogue cache per instance, ban list store, starter set, page composition.
// Nothing here touches outfit_pool or the default feed.
import "server-only";
import { BanState } from "@/outfits/ban";
import { getCatalogue, type Catalogue } from "@/outfits/catalogue";
import { compose, newSession, type ComposedOutfit, type Session } from "@/outfits/compose";
import { alternativesFor } from "@/outfits/compose-alts";
import { makeRnd } from "@/outfits/pool-shared";
import { gatewayRpc } from "@/lib/gateway";
import type { FeedAccessory, FeedAlt, FeedCard, FeedOutfit } from "@/lib/types";

export const getCat = (): Promise<Catalogue> => getCatalogue((known) => gatewayRpc("snapshot_get", { p_known_version: known }));

export async function readBan(device: string): Promise<BanState> { return BanState.fromBase64(await gatewayRpc<string | null>("ban_get", { p_device: device })); }
export async function writeBan(device: string, ban: BanState) { await gatewayRpc("ban_put", { p_device: device, p_b64: ban.toBase64() }, { retry: false }); }

interface CardRow { id: number; card?: FeedCard; acc?: { type: string | null; size: string | null; front_flat: boolean | null; belt_shape: string | null } }
export async function cardsFor(ids: number[]): Promise<Map<number, CardRow>> {
  const out = new Map<number, CardRow>(); const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 150) for (const r of await gatewayRpc<CardRow[]>("cards_by_ids", { p_ids: uniq.slice(i, i + 150) })) out.set(r.id, r);
  return out;
}

interface StarterRow { ord: number; kind: "three" | "full"; piece_ids: number[]; acc_ids: number[]; score: number; style: string; contrast: boolean; hash: number }
const starterCache = new Map<string, { at: number; rows: StarterRow[] }>();
export async function starterRows(g: string): Promise<StarterRow[]> {
  const c = starterCache.get(g); if (c && Date.now() - c.at < 10 * 60_000) return c.rows;
  const rows = await gatewayRpc<StarterRow[]>("starter_list", { p_gender: g }); starterCache.set(g, { at: Date.now(), rows }); return rows;
}

/** composed outfits (+ their 2 alternatives per piece) -> the same shape the feed UI already renders */
export async function toFeedOutfits(cat: Catalogue, g: "women" | "men", outs: ComposedOutfit[], alts: Record<string, number[]>[], orderBase: number): Promise<FeedOutfit[]> {
  const ids = [...outs.flatMap((o) => [...o.ids, ...o.acc.map((a) => a.id)]), ...alts.flatMap((a) => Object.values(a).flat())];
  const cards = await cardsFor(ids);
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
    res.push({ id: o.hash, kind: o.kind, score: o.score, order: orderBase + i, top: mains[0]!, bottom: full ? null : mains[1]!, shoes: mains[mains.length - 1]!, accessories, alts: altOut,
      dyn: { style: o.style, store: first.store, season: o.season.season, fit: o.season.fit, bucket: o.bucket, pattern: o.pattern, ids: [...o.ids, ...o.acc.map((a) => a.id)] } });
  });
  return res;
}

export interface PageInput { device: string; gender: "women" | "men"; recent?: { ids: number[]; style: string; store: string }[]; startersServed?: number; persona?: string | null }
export async function dynamicPage(inp: PageInput): Promise<{ items: FeedOutfit[]; ms: { total: number; ban: number; compose: number; cards: number } }> {
  const t0 = performance.now(); const cat = await getCat();
  const tb = performance.now(); const ban = await readBan(inp.device);
  if (inp.startersServed && inp.startersServed > 0) {            // first dynamic page after the starter set: the starter pieces are banned too
    const rows = (await starterRows(inp.gender)).slice(0, inp.startersServed); ban.push(rows.flatMap((r) => [...r.piece_ids, ...r.acc_ids]));
  }
  const session: Session = newSession();
  for (const r of inp.recent ?? []) session.guard.push(r.ids, r.style, r.store);
  for (const r of inp.recent ?? []) for (const id of r.ids) session.uses.set(id, (session.uses.get(id) ?? 0) + 1);
  const tc = performance.now();
  const seed = Math.floor(Math.random() * 2 ** 31);
  const { outfits, ban: ban2 } = compose(cat, { gender: inp.gender, taste: null }, ban, 6, session, makeRnd(seed));
  const eff = ban2.effective(cat, inp.gender);
  const alts = outfits.map((o) => alternativesFor(cat, inp.gender, o, eff));
  const tk = performance.now();
  const items = await toFeedOutfits(cat, inp.gender, outfits, alts, 0);
  const te = performance.now();
  await writeBan(inp.device, ban2);
  return { items, ms: { total: performance.now() - t0, ban: tc - tb, compose: tk - tc, cards: te - tk } };
}

export async function starterPage(g: "women" | "men", page: number): Promise<FeedOutfit[]> {
  const cat = await getCat(); const rows = (await starterRows(g)).slice(page * 6, page * 6 + 6);
  if (!rows.length) return [];
  const { composedFromRow } = await import("@/outfits/starter");
  const outs = rows.map((r) => composedFromRow(cat, r));
  const ban = new BanState(); const eff = ban.effective(cat, g);
  return toFeedOutfits(cat, g, outs, outs.map((o) => alternativesFor(cat, g, o, eff)), page * 6);
}
