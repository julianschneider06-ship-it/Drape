// Server side of the Search tab. Read-only: one grouped read of the active pool (rpc search_index), tags computed on demand from the in-memory catalogue
// (the same pure function the feed uses), index cached per function instance. No database write, no paid call, nothing stored per outfit.
import "server-only";
import { gatewayRpc } from "@/lib/gateway";
import { getCat } from "@/lib/dynamic";
import { outfitTags } from "@/outfits/tags";
import { buildFacets, rowFromTags, searchRank, type Facets, type SearchQuery, type SearchRow, type Relaxed } from "@/lib/search";
import type { FeedAccessory, FeedCard, FeedOutfit } from "@/lib/types";

type G = "women" | "men";
interface PoolRow { id: number; k: "three" | "full"; t: number; b: number; s: number; sc: number; st: string | null; a: { p: number; ty: string; pl: string; z: string | null; n: number }[] }
interface Index { at: number; rows: SearchRow[]; pool: Map<number, PoolRow>; facets: Facets; }

const TTL_MS = 10 * 60_000, PAGE = 1500;
const cache = new Map<G, Index>(), inflight = new Map<G, Promise<Index>>();

async function build(g: G): Promise<Index> {
  const cat = await getCat(g);
  const pool = new Map<number, PoolRow>(), rows: SearchRow[] = [];
  for (let after = 0; ; ) {
    const page = await gatewayRpc<PoolRow[]>("search_index", { p_gender: g, p_after: after, p_limit: PAGE });
    for (const r of page) {
      pool.set(r.id, r);
      const ps = [r.t, ...(r.k === "full" ? [] : [r.b]), r.s].map((id) => cat.byId.get(id));
      if (!ps.every(Boolean)) continue;   // a piece left the catalogue (out of stock, no cutout ...): the outfit is not offered
      const accs = r.a.map((a) => cat.accById.get(a.p)).filter((a): a is NonNullable<typeof a> => !!a);
      const tags = outfitTags(cat, { pieces: ps as NonNullable<(typeof ps)[number]>[], accs });
      const row = rowFromTags(r.id, tags, { score: r.sc, acc: accs.length > 0, full: r.k === "full" });
      if (row) rows.push(row);
    }
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }
  const ix: Index = { at: Date.now(), rows, pool, facets: buildFacets(rows) };
  cache.set(g, ix);
  return ix;
}

export async function getIndex(g: G): Promise<Index> {
  const c = cache.get(g);
  if (c && Date.now() - c.at < TTL_MS) return c;
  let p = inflight.get(g);
  if (!p) { p = build(g).finally(() => inflight.delete(g)); inflight.set(g, p); }
  return c ? p.catch(() => c) : p;   // a failed refresh keeps serving the last good index
}

export async function searchFacets(g: G): Promise<Facets> { return (await getIndex(g)).facets; }

export async function searchOutfits(g: G, q: SearchQuery): Promise<{ items: FeedOutfit[]; relaxed: Relaxed; exact: number }> {
  const ix = await getIndex(g), cat = await getCat(g);
  const { ids, relaxed, exact } = searchRank(ix.rows, q);
  const items: FeedOutfit[] = [];
  ids.forEach((id, order) => {
    const r = ix.pool.get(id); if (!r) return;
    const card = (pid: number) => cat.byId.get(pid)?.card as FeedCard | undefined;
    const top = card(r.t), shoes = card(r.s), bottom = r.k === "full" ? null : card(r.b) ?? null;
    if (!top || !shoes || (r.k === "three" && !bottom)) return;
    const accessories: FeedAccessory[] = r.a.flatMap((a) => {
      const ca = cat.accById.get(a.p), c = ca?.card as FeedCard | undefined;
      return ca && c ? [{ card: c, type: a.ty, placement: a.pl as FeedAccessory["placement"], zone: a.z, size: ca.size ?? null, front_flat: ca.frontFlat ?? null, belt_shape: ca.beltShape ?? null, slot_no: a.n }] : [];
    });
    const ps = [r.t, ...(r.k === "full" ? [] : [r.b]), r.s].map((pid) => cat.byId.get(pid)!);
    const tags = outfitTags(cat, { pieces: ps, accs: accessories.map((a) => cat.accById.get(a.card.id)!).filter(Boolean) });
    items.push({ id, kind: r.k, score: r.sc, order, top, bottom, shoes, accessories, tags });
  });
  return { items, relaxed, exact };
}
