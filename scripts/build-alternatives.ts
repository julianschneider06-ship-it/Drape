// Alternatives builder (background job, idempotent, resumable): for every outfit in the pool and every swappable piece
// (top / bottom / shoes / acc1..acc3) up to 6 alternatives, ranked by the same compatibility scoring as the outfit builder,
// with the other pieces of the outfit fixed. Stored in outfit_alternatives; an outfit is only recomputed when its inputs changed
// (hash of its pieces, accessories and the eligible candidate set + scorer version). No work in the request path.
// Usage: npx tsx scripts/build-alternatives.ts [--force] [--limit N] [--dry]
import { createHash } from "node:crypto";
import { rpc } from "../src/ingest/gateway";
import { scoreOutfit, toPiece, type Piece, type RawPiece, type Slot } from "../src/outfits/score";
import { BAG, HEAD, NECK, ACC, WOMEN_ACC, isJewelry, singleKind, outfitCtx, reject, scoreAcc, toAcc, type Acc, type OutfitCtx, type RawAcc } from "../src/outfits/accessories";
import { RULES } from "../src/lib/layout/config";
import { pickPair, type Cnd } from "../src/outfits/alt-shared";

const VERSION = "alt3";   // alt3: ranks 1 and 2 are the swap-loop pair (visibly different from each other)
// alt2:   // alt2: a bottom is replaced by a bottom of the same length class (shorts / short skirt stay short, long stays long)
const args = process.argv.slice(2);
const FORCE = args.includes("--force"), DRY = args.includes("--dry");
const W2 = args.includes("--w2");   // women's accessory set revision 2: only the accessory slots, stored as w2acc1.. (the old acc1..3 rows and alt_state are not touched)
const LIMIT = Number(args[args.indexOf("--limit") + 1] || Infinity);
const MAX_ALTS = 6, MIN_SCORE = 0.78;

interface PoolRow { id: number; gender: "women" | "men"; kind: string; top: number; bottom: number; shoes: number; order: number }
interface Info { id: number; brand: string; slot: string; presentation: string | null; fill: number | null }
interface AccRow { outfit_id: number; slot_no: number; product_id: number; type: string; zone: string }

async function paged<T extends { id: number }>(fn: string, limit: number): Promise<T[]> {
  const out: T[] = []; let after = 0;
  for (;;) { const page = await rpc<T[]>(fn, { p_after: after, p_limit: limit }); if (!page.length) break; out.push(...page); after = page[page.length - 1].id; }
  return out;
}
const SHORT = /\b(shorts?|skort|mini|bermuda)\b/i;
const shortish = (name: string | undefined) => SHORT.test(name ?? "");
const folded = (slot: string, info: Info | undefined) => slot === "shoes" || slot === "full_body" ? false : !!info && ((info.presentation != null && !RULES.stackedPresentations.includes(info.presentation)) || (slot === "top" && (info.fill ?? 0) >= RULES.foldedFillMin));

/** Best first, at most MAX_ALTS, no two alternatives from the same brand in a row where possible. */
function diversify<T extends { brand: string; score: number }>(sorted: T[]): T[] {
  const out: T[] = []; const rest = [...sorted];
  while (out.length < MAX_ALTS && rest.length) {
    let i = rest.findIndex((c) => !out.length || c.brand !== out[out.length - 1].brand);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  const pool = (await paged<PoolRow>("outfit_pool_list", 2000)).filter((o) => !W2 || o.gender === "women");
  const raw: RawPiece[] = []; { let after = 0; for (;;) { const p = await rpc<RawPiece[]>("outfit_inputs", { p_after: after, p_limit: 1000 }); if (!p.length) break; raw.push(...p); after = p[p.length - 1].id; } }
  const info = new Map((await paged<Info>("alt_pieces", 1000)).map((i) => [i.id, i]));
  const pieces = new Map<number, Piece>(); const names = new Map<number, string>();
  for (const r of raw) { const p = toPiece(r); if (p) { pieces.set(r.id, p); names.set(r.id, `${r.name ?? ""} ${r.sub ?? ""}`); } }   // all feed-ready pieces: the CURRENT pieces of an outfit need no measurement, candidates do
  const accs = (await paged<RawAcc & { id: number }>("acc_inputs", 1000)).map(toAcc);
  const accById = new Map(accs.map((a) => [a.id, a]));
  const accRows = new Map<number, AccRow[]>();
  { let after = 0; for (;;) { const page = await rpc<AccRow[]>(W2 ? "outfit_acc_w2_all" : "outfit_acc_all", { p_after: after, p_limit: 5000 }); if (!page.length) break;
      for (const r of page) { const l = accRows.get(r.outfit_id) ?? []; if (!l.some((x) => x.slot_no === r.slot_no)) l.push(r); accRows.set(r.outfit_id, l); }
      if (page.length < 5000) break; after = page[page.length - 1].outfit_id - 1; } }
  const state = new Map<number, string>();
  { let after = 0; for (;;) { const page = await rpc<{ outfit_id: number; input_hash: string }[]>("alt_state_list", { p_after: after, p_limit: 5000 }); if (!page.length) break; for (const r of page) state.set(r.outfit_id, r.input_hash); after = page[page.length - 1].outfit_id; } }
  // fingerprint of the candidate set: when eligible products change, every outfit is recomputed
  let sig = 0; for (const id of info.keys()) sig = (sig * 31 + id) % 1_000_000_007; for (const a of accs) sig = (sig * 31 + a.id) % 1_000_000_007;
  console.log(`outfits ${pool.length}, eligible main pieces ${pieces.size}, accessories ${accs.length}, known states ${state.size}, candidate signature ${sig}`);

  const bySlotGender = (slot: Slot, g: "women" | "men") => [...pieces.values()].filter((p) => info.has(p.id) && p.slot === slot && p.genders.includes(g));
  const cand: Record<string, Piece[]> = {};
  for (const g of ["women", "men"] as const) for (const s of ["top", "bottom", "shoes", "full_body"] as Slot[]) cand[`${g}:${s}`] = bySlotGender(s, g);

  const items: object[] = []; let done = 0, skipped = 0, slotsTotal = 0, altsTotal = 0, under3 = 0;
  const perKind: Record<string, { n: number; alts: number; under3: number }> = {};
  const flush = async () => { if (items.length && !DRY) await rpc(W2 ? "alt_upsert_slots" : "alt_upsert", { p_items: items.splice(0) }); else items.length = 0; };

  for (const o of pool) {
    if (done >= LIMIT) break;
    const outfitPieces = [o.top, ...(o.bottom ? [o.bottom] : []), o.shoes].map((id) => pieces.get(id));
    if (outfitPieces.some((p) => !p)) continue;
    const ps = outfitPieces as Piece[];
    const myAccs = (accRows.get(o.id) ?? []).sort((a, b) => a.slot_no - b.slot_no);
    const hash = createHash("sha1").update([o.id, o.top, o.bottom, o.shoes, ...myAccs.map((a) => a.product_id), VERSION, sig].join("|")).digest("hex").slice(0, 16);
    if (!FORCE && !W2 && state.get(o.id) === hash) { skipped++; continue; }
    done++;
    const slots: { slot_key: string; alts: { product_id: number; score: number }[] }[] = [];
    const g = o.gender, isFull = o.bottom === 0;
    const accObjs = myAccs.map((r) => accById.get(r.product_id)).filter((a): a is Acc => !!a);
    const ctxOf = (list: Piece[]) => outfitCtx(g, list, list.map((p) => names.get(p.id) ?? ""));

    // ---- main pieces ----
    const mainSlots: { key: string; slot: Slot; idx: number; id: number }[] = [{ key: "top", slot: isFull ? "full_body" : "top", idx: 0, id: o.top }];
    if (!isFull) mainSlots.push({ key: "bottom", slot: "bottom", idx: 1, id: o.bottom });
    mainSlots.push({ key: "shoes", slot: "shoes", idx: ps.length - 1, id: o.shoes });
    for (const ms of W2 ? [] : mainSlots) {
      const cur = ps[ms.idx]; const curFold = folded(ms.slot, info.get(cur.id));
      const sc: Cnd[] = [];
      for (const c of cand[`${g}:${ms.slot}`] ?? []) {
        if (c.id === cur.id || ps.some((p) => p.id === c.id)) continue;
        if (folded(ms.slot, info.get(c.id)) !== curFold) continue;               // same presentation: the layout type must not jump
        if (ms.slot === "bottom" && shortish(names.get(c.id)) !== shortish(names.get(cur.id))) continue;   // same length class: shorts stay shorts, long trousers stay long (shoes size follows the bottom)
        const next = ps.map((p, i) => (i === ms.idx ? c : p));
        const s = scoreOutfit(next);
        if (!s || s.score < MIN_SCORE) continue;
        if (c.statement >= ACC.statementMin && accObjs.some((a) => a.statement >= ACC.statementMin)) continue;   // at most one statement piece overall
        const ctx = ctxOf(next);
        if (accObjs.some((a) => reject(a, ctx))) continue;                        // the accessories must still suit the changed outfit
        sc.push({ product_id: c.id, brand: info.get(c.id)?.brand ?? c.store, score: s.score, main: c.main, vec: c.vec });
      }
      sc.sort((a, b) => b.score - a.score);
      const pair = pickPair(sc), rest = diversify(sc.filter((x) => !pair.includes(x)));
      slots.push({ slot_key: ms.key, alts: [...pair, ...rest].slice(0, MAX_ALTS).map((x) => ({ product_id: x.product_id, score: +x.score.toFixed(4) })) });
    }

    // ---- accessories ----
    const ctx: OutfitCtx = ctxOf(ps);
    myAccs.forEach((r, i) => {
      const cur = accById.get(r.product_id); if (!cur) return;
      const others = accObjs.filter((a) => a.id !== cur.id);
      const types = new Set(others.map((a) => a.type));
      const head = others.some((a) => HEAD.has(a.type)), bag = others.some((a) => BAG.has(a.type)), neck = others.some((a) => NECK.has(a.type));
      const statement = ctx.statements > 0 || others.some((a) => a.statement >= ACC.statementMin);
      const accents = new Set([...ctx.accents, ...others.map((a) => a.accent).filter((x): x is string => !!x)]);
      const sameType: Cnd[] = [], otherType: Cnd[] = [];
      for (const c of accs) {
        if (c.id === cur.id || accObjs.some((a) => a.id === c.id) || reject(c, ctx)) continue;
        if (types.has(c.type)) continue;
        if (W2 && (singleKind(c.type) && others.some((a) => singleKind(a.type) === singleKind(c.type)) || isJewelry(c.type) && others.filter((a) => isJewelry(a.type)).length >= WOMEN_ACC.jewelry.max || c.type === "belt" && others.some((a) => a.type === "belt"))) continue;   // women's slot limits hold for alternatives too
        if (HEAD.has(c.type) && head || BAG.has(c.type) && bag || NECK.has(c.type) && neck) continue;
        if (c.statement >= ACC.statementMin && statement) continue;
        if (c.accent && accents.size && ![...accents].every((x) => x === c.accent) && others.some((a) => a.accent)) continue;   // no second strong accent colour
        (c.type === cur.type ? sameType : otherType).push({ product_id: c.id, brand: c.store, score: scoreAcc(c, ctx), main: c.main, vec: c.vec });
      }
      sameType.sort((a, b) => b.score - a.score); otherType.sort((a, b) => b.score - a.score);
      const ordered = sameType.length >= 2 ? sameType : [...sameType, ...otherType];
      const pair = pickPair(ordered), restSame = diversify(sameType.filter((x) => !pair.includes(x)));
      let list: Cnd[] = [...pair, ...restSame];
      if (list.length < 3) list = [...list, ...diversify(otherType).filter((x) => !list.some((y) => y.product_id === x.product_id))];
      list = list.slice(0, MAX_ALTS);
      slots.push({ slot_key: `${W2 ? "w2acc" : "acc"}${r.slot_no}`, alts: list.map((x) => ({ product_id: x.product_id, score: +x.score.toFixed(4) })) });
      void i;
    });

    for (const sl of slots) {
      slotsTotal++; altsTotal += sl.alts.length; if (sl.alts.length < 3) under3++;
      const k = /^(w2)?acc/.test(sl.slot_key) ? "acc" : sl.slot_key; const e = (perKind[k] ??= { n: 0, alts: 0, under3: 0 }); e.n++; e.alts += sl.alts.length; if (sl.alts.length < 3) e.under3++;
    }
    items.push({ outfit_id: o.id, input_hash: hash, version: VERSION, slots });
    if (items.length >= 40) await flush();
    if (done % 500 === 0) console.log(`  ${done} outfits (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  await flush();
  console.log(`computed ${done} outfits, skipped (unchanged) ${skipped}, slots ${slotsTotal}, avg alternatives per slot ${(altsTotal / Math.max(1, slotsTotal)).toFixed(2)}, slots with fewer than 3: ${under3}`);
  console.log("per slot kind", JSON.stringify(Object.fromEntries(Object.entries(perKind).map(([k, v]) => [k, { slots: v.n, avg: +(v.alts / v.n).toFixed(2), under3: v.under3 }]))));
  console.log(`done in ${((Date.now() - t0) / 1000) | 0}s`);
})();
