// Composes ONE outfit around a given searched piece (used by Search). Read-only and deterministic: no AI call, no database read, no write.
// It reuses the normal composer's parts unchanged: scoreOutfit (hard rules + minimum score), pairScore, the shoe-length rule, the accessory rules
// (chooseAccessories / outfitCtx incl. the women's slot limits), layoutCheck, the season function and the outfit hash. The rest of the outfit is as free as in the
// feed: only the searched piece is fixed, the other pieces are not required to share its style family, season or extras.
import { ACC, chooseAccessories, HEAD, BAG, isJewelry, NECK, outfitCtx, placementFor, reject, scoreAcc, singleKind, WOMEN_ACC, type Acc, type Pick, type Usage } from "./accessories";
import type { CatAcc, Catalogue, CatPiece } from "./catalogue";
import { layoutCheck, lengthShoeOk, outfitHash, type ComposedAcc, type ComposedOutfit } from "./compose";
import { COMPOSE } from "./compose-config";
import { makeRnd, pairScore, type Rnd } from "./pool-shared";
import { outfitStyle, scoreOutfit, type Piece } from "./score";
import { outfitSeason, seasonRole, type SeasonPiece } from "./season";

type Gender = "women" | "men";
export interface AroundState { uses: Map<number, number>; acc: Usage; liked?: Set<number>; avoid?: Set<number> }   // liked / avoid: Wishlist only (liked products are preferred as partners, avoided ids are left out while other pieces exist)
const LIKED_BOOST = 40, LIKED_ACC_BOOST = 1.35;
/** state shared by all outfits of one search: spreads partner pieces and accessories (like the session of the feed) */
export const newAround = (): AroundState => ({ uses: new Map(), acc: { uses: new Map(), recentIds: [], recentStores: [] } });

const SAMPLE = 90, ATTEMPTS = 5, BASES = 12;
const lists = new WeakMap<Catalogue, Map<string, CatPiece[]>>(), accLists = new WeakMap<Catalogue, Map<Gender, CatAcc[]>>();
const slotList = (cat: Catalogue, g: Gender, slot: string): CatPiece[] => {
  let m = lists.get(cat); if (!m) lists.set(cat, (m = new Map()));
  const k = `${g}:${slot}`; let l = m.get(k);
  if (!l) m.set(k, (l = Array.from(cat.index.get(k) ?? [], (i) => cat.pieces[i]).filter((p) => p.card)));
  return l;
};
const accPool = (cat: Catalogue, g: Gender): CatAcc[] => {
  let m = accLists.get(cat); if (!m) accLists.set(cat, (m = new Map()));
  let l = m.get(g); if (!l) m.set(g, (l = cat.accs.filter((a) => a.genders.includes(g) && a.card)));
  return l;
};
const fits = (p: { mask: number }, mask: number) => ((p.mask || 15) & mask) !== 0;
function sample<T>(list: T[], k: number, rnd: Rnd): T[] {
  if (list.length <= k) return list;
  const a = list.slice(); for (let i = 0; i < k; i++) { const j = i + Math.floor(rnd() * (a.length - i)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k);
}
function pickW<T>(items: T[], w: (x: T) => number, rnd: Rnd): T | null {
  if (!items.length) return null;
  let tot = 0; const ws = items.map((x) => { const v = Math.max(0, w(x)); tot += v; return v; });
  if (tot <= 0) return items[Math.floor(rnd() * items.length)];
  let r = rnd() * tot; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

interface Main { ps: CatPiece[]; kind: "three" | "full"; score: number }
/** the main pieces (top + bottom + shoes, or one-piece + shoes) around one fixed main piece; same steps as the feed composer, anchor given instead of drawn */
function completeFrom(cat: Catalogue, g: Gender, anchor: CatPiece, minS: number, wide: number, st: AroundState, rnd: Rnd, kinds: ("three" | "full")[]): Main | null {
  const lb = (p: CatPiece) => (st.liked?.has(p.id) ? LIKED_BOOST : 1);
  const fresh = (p: CatPiece) => lb(p) / (1 + COMPOSE.freshnessPerUse * (st.uses.get(p.id) ?? 0));
  const byScore = (a: [CatPiece, number], b: [CatPiece, number]) => b[1] * lb(b[0]) - a[1] * lb(a[0]);
  const compat = (slot: string) => {
    const l = slotList(cat, g, slot).filter((p) => fits(p, anchor.mask));
    const f = st.avoid?.size ? l.filter((p) => !st.avoid!.has(p.id)) : l;
    return f.length ? f : l;
  };
  /** all liked candidates plus a random sample of the rest (Wishlist); the normal sample otherwise */
  const smp = (l: CatPiece[], k: number) => (st.liked ? [...l.filter((p) => st.liked!.has(p.id)), ...sample(l.filter((p) => !st.liked!.has(p.id)), k, rnd)] : sample(l, k, rnd));
  const full = (): Main | null => {
    if (anchor.slot === "shoes") {   // one-piece garment + the searched shoes
      const sc: [CatPiece, number][] = [];
      for (const f of smp(compat("full_body"), Math.round(SAMPLE * wide))) { const r = scoreOutfit([f, anchor]); if (r && r.score >= minS) sc.push([f, r.score]); }
      sc.sort(byScore);
      const ch = pickW(sc.slice(0, COMPOSE.topN), ([f, v]) => Math.pow(v, COMPOSE.scoreExponent) * fresh(f), rnd);
      return ch ? { ps: [ch[0], anchor], kind: "full", score: ch[1] } : null;
    }
    if (anchor.slot !== "full_body") return null;
    const sc: [CatPiece, number][] = [];
    for (const s of smp(compat("shoes"), Math.round(SAMPLE * wide))) { const r = scoreOutfit([anchor, s]); if (r && r.score >= minS) sc.push([s, r.score]); }
    sc.sort(byScore);
    const ch = pickW(sc.slice(0, COMPOSE.topN), ([s, v]) => Math.pow(v, COMPOSE.scoreExponent) * fresh(s), rnd);
    return ch ? { ps: [anchor, ch[0]], kind: "full", score: ch[1] } : null;
  };
  const three = (): Main | null => {
    if (anchor.slot === "full_body") return null;
    const second = anchor.slot === "top" ? "bottom" : anchor.slot === "bottom" ? "top" : "bottom";
    const third = (["top", "bottom", "shoes"] as const).find((s) => s !== anchor.slot && s !== second)!;
    const sec: [CatPiece, number][] = [];
    for (const y of smp(compat(second), Math.round(SAMPLE * wide))) { const s = pairScore(anchor, y, rnd); if (s > 0) sec.push([y, s]); }
    sec.sort(byScore);
    let secs = sec.slice(0, COMPOSE.pairK);
    for (let t = 0; t < 3; t++) {
      const sp = pickW(secs, ([y, v]) => Math.pow(v, COMPOSE.scoreExponent) * fresh(y), rnd); if (!sp) break;
      secs = secs.filter((x) => x !== sp);
      const y = sp[0], fin: [CatPiece, number][] = [];
      const trio = (z: CatPiece) => { const o = [anchor, y, z]; const by = (s: string) => o.find((p) => p.slot === s)!; return [by("top"), by("bottom"), by("shoes")]; };
      for (const z of smp(compat(third), Math.round(SAMPLE * wide))) {
        const ps = trio(z); if (!lengthShoeOk(ps[1], ps[2])) continue;
        const r = scoreOutfit(ps); if (r && r.score >= minS) fin.push([z, r.score]);
      }
      fin.sort(byScore);
      const fp = pickW(fin.slice(0, COMPOSE.topN), ([z, v]) => Math.pow(v, COMPOSE.scoreExponent) * fresh(z), rnd);
      if (fp) return { ps: trio(fp[0]), kind: "three", score: fp[1] };
    }
    return null;
  };
  for (const k of kinds) { const r = k === "full" ? full() : three(); if (r) return r; }
  return null;
}

const SHARE_FULL = (cat: Catalogue, g: Gender) => Math.min(0.5, slotList(cat, g, "full_body").length / Math.max(1, slotList(cat, g, "top").length));

/** the companions of a searched accessory: same rules as the feed, with the searched one fixed first and the slot limits counted for it */
function companions(g: Gender, A: Acc, ctx: ReturnType<typeof outfitCtx>, pool: Acc[], usage: Usage, boost?: (id: number) => number): Pick[] {
  const sk = singleKind(A.type);
  const clash = (b: Acc) => b.id === A.id || b.type === A.type || (sk !== null && sk === singleKind(b.type)) || (HEAD.has(A.type) && HEAD.has(b.type)) || (BAG.has(A.type) && BAG.has(b.type)) || (NECK.has(A.type) && NECK.has(b.type));
  const c2 = { ...ctx, accents: new Set([...ctx.accents, ...(A.accent ? [A.accent] : [])]), statements: ctx.statements + (A.statement >= ACC.statementMin ? 1 : 0), maxN: Math.max(0, ctx.maxN - 1) };
  const picks = chooseAccessories(c2, pool.filter((b) => !clash(b)), usage, boost);
  if (g !== "women") return picks.slice(0, c2.maxN);
  const out: Pick[] = []; let jew = isJewelry(A.type) ? 1 : 0;
  for (const p of picks) {
    if (out.length + 1 >= WOMEN_ACC.maxTotal) break;
    if (isJewelry(p.acc.type)) { if (jew >= WOMEN_ACC.jewelry.max) continue; jew++; }
    out.push(p);
  }
  return out;
}

/**
 * One outfit around the searched piece, or null when none can be built (the caller then skips that piece).
 * `anchorId` is a top / bottom / shoes id of the gender's catalogue, or an accessory id when `accessory` is true. Deterministic for the same catalogue.
 */
export function composeAround(cat: Catalogue, g: Gender, anchorId: number, accessory: boolean, st: AroundState, salt = 0): ComposedOutfit | null {
  const rnd = makeRnd((Math.imul(anchorId + salt * 7919, 2654435761) + 0x9e3779b9) >>> 0);   // salt: another seed for a second try
  const fullShare = SHARE_FULL(cat, g);
  const kindsFor = (): ("three" | "full")[] => (rnd() < fullShare ? ["full", "three"] : ["three", "full"]);
  const accAll = accPool(cat, g), accFree = st.avoid?.size ? accAll.filter((a) => !st.avoid!.has(a.id)) : accAll, accs = accFree.length >= 3 ? accFree : accAll;
  const boost = st.liked ? (id: number) => (st.liked!.has(id) ? LIKED_ACC_BOOST : 1) : undefined;
  let main: Main | null = null, acc: ComposedAcc[] = [], attempts = 0;
  const finish = (m: Main, picks: Pick[]): boolean => {
    const a: ComposedAcc[] = picks.map((p) => ({ id: p.acc.id, type: p.acc.type, placement: p.placement, zone: p.zone, score: +p.score.toFixed(3) }));
    if (!layoutCheck(cat, m.kind, m.ps, a)) return false;
    main = m; acc = a; return true;
  };
  if (!accessory) {
    const anchor = cat.byId.get(anchorId); if (!anchor || !anchor.card) return null;
    for (; attempts < ATTEMPTS; attempts++) {
      const m = completeFrom(cat, g, anchor, attempts < 3 ? COMPOSE.minScore : COMPOSE.contrastMinScore, attempts >= 2 ? 1.6 : 1, st, rnd, anchor.slot === "full_body" ? ["full"] : anchor.slot === "shoes" ? kindsFor() : ["three"]);
      if (!m) continue;
      const ctx = outfitCtx(g, m.ps as Piece[], m.ps.map((p) => `${p.name} ${p.sub}`));
      if (finish(m, accs.length ? chooseAccessories(ctx, accs, st.acc, boost) : [])) break;
    }
  } else {
    const A = cat.accById.get(anchorId); if (!A || !A.card) return null;
    for (; attempts < BASES && !main; attempts++) {   // base outfits until the searched accessory passes the hard accessory rules (season, tailored, warm / cold ...)
      const useFull = rnd() < fullShare && slotList(cat, g, "full_body").length > 0;
      const start = pickW(sample(slotList(cat, g, useFull ? "full_body" : "top").filter((p) => fits(p, A.mask)), 10, rnd), (p) => 1 / (1 + COMPOSE.freshnessPerUse * (st.uses.get(p.id) ?? 0)), rnd);
      if (!start) continue;
      const m = completeFrom(cat, g, start, attempts < 6 ? COMPOSE.minScore : COMPOSE.contrastMinScore, attempts >= 4 ? 1.6 : 1, st, rnd, [useFull ? "full" : "three"]);
      if (!m) continue;
      const ctx = outfitCtx(g, m.ps as Piece[], m.ps.map((p) => `${p.name} ${p.sub}`));
      if (reject(A, ctx)) continue;
      finish(m, [{ acc: A, score: scoreAcc(A, ctx), ...placementFor(A, ctx) }, ...companions(g, A, ctx, accs, st.acc, boost)]);
    }
  }
  const m = main as Main | null; if (!m) return null;
  const ids = m.ps.map((p) => p.id), style = outfitStyle(m.ps);
  const roles: SeasonPiece[] = [...m.ps.map((p) => ({ mask: p.mask, role: seasonRole(p.slot, `${p.name} ${p.sub}`, p.outer, p.cold, p.warm) })), ...acc.map((a) => { const c = cat.accById.get(a.id)!; return { mask: c.mask, role: seasonRole("accessory", "", false, false, false, a.type) }; })];
  for (const p of m.ps) st.uses.set(p.id, (st.uses.get(p.id) ?? 0) + 1);
  st.acc.recentIds.push(acc.map((a) => a.id)); st.acc.recentStores.push(acc.map((a) => cat.accById.get(a.id)!.store));
  if (st.acc.recentIds.length > 14) { st.acc.recentIds.shift(); st.acc.recentStores.shift(); }
  for (const a of acc) st.acc.uses.set(a.id, (st.acc.uses.get(a.id) ?? 0) + 1);
  return { kind: m.kind, ids, acc, score: +m.score.toFixed(4), style, season: outfitSeason(roles), bucket: "new", hash: outfitHash([...m.ps.map((p) => ({ slot: p.slot, id: p.id })), ...acc.map((a) => ({ slot: `acc:${a.type}`, id: a.id }))]), layoutOk: true, attempts: attempts + 1 };
}
