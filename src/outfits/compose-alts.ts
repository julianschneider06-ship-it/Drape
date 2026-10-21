// Swap alternatives from the composer: the rest of the outfit stays fixed, same slot, visibly different pair (pickPair, shared with the stored-alternatives job),
// ban list applied softly (allowed()), same presentation class and bottom length class so the layout type does not jump.
import { RULES } from "../lib/layout/config";
import { BAG, HEAD, NECK, ACC, outfitCtx, reject, scoreAcc, type OutfitCtx } from "./accessories";
import { allowed } from "./ban";
import type { Catalogue, CatAcc, CatPiece } from "./catalogue";
import { COMPOSE } from "./compose-config";
import type { ComposedOutfit } from "./compose";
import { pickPair, type Cnd } from "./alt-shared";
import { scoreOutfit, type Piece } from "./score";

const folded = (p: CatPiece) => p.slot === "shoes" || p.slot === "full_body" ? false : (p.presentation != null && !(RULES.stackedPresentations as readonly string[]).includes(p.presentation)) || (p.slot === "top" && (p.fill ?? 0) >= RULES.foldedFillMin);
const BOOTS = /\b(boots?|chelsea|hiker)\b/i;

/** two alternatives per piece (slot keys top | bottom | shoes | acc1..3), as product ids, best first */
export function alternativesFor(cat: Catalogue, g: "women" | "men", o: ComposedOutfit, eff: { banned: Set<number>; age: Map<number, number> }): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const ps = o.ids.map((id) => cat.byId.get(id)!);
  const accs = o.acc.map((a) => cat.accById.get(a.id)!);
  const full = o.kind === "full";
  const mainKeys: { key: string; slot: string; idx: number }[] = [{ key: "top", slot: full ? "full_body" : "top", idx: 0 }];
  if (!full) mainKeys.push({ key: "bottom", slot: "bottom", idx: 1 });
  mainKeys.push({ key: "shoes", slot: "shoes", idx: ps.length - 1 });
  const ctxOf = (list: CatPiece[]) => outfitCtx(g, list as Piece[], list.map((p) => `${p.name} ${p.sub}`));
  for (const m of mainKeys) {
    const cur = ps[m.idx];
    const pool = allowed(Array.from(cat.index.get(`${g}:${m.slot}`) ?? [], (i) => cat.pieces[i]), eff, COMPOSE.ban.minPool).filter((c) => c.id !== cur.id && !ps.some((p) => p.id === c.id));
    const run = (minS: number): Cnd[] => {
      const sc: Cnd[] = [];
      for (const c of pool) {
        if (folded(c) !== folded(cur)) continue;
        if (m.slot === "bottom" && c.short !== cur.short) continue;
        const next = ps.map((p, i) => (i === m.idx ? c : p));
        if (m.slot === "shoes" && next.find((p) => p.slot === "bottom")?.short && BOOTS.test(`${c.sub} ${c.name}`)) continue;
        const s = scoreOutfit(next); if (!s || s.score < minS) continue;
        if (c.statement >= ACC.statementMin && accs.some((a) => a.statement >= ACC.statementMin)) continue;
        const ctx = ctxOf(next); if (accs.some((a) => reject(a, ctx))) continue;
        sc.push({ product_id: c.id, brand: c.brand, score: s.score, main: c.main, vec: c.vec });
      }
      return sc.sort((a, b) => b.score - a.score);
    };
    let sc = run(COMPOSE.minScore); if (sc.length < 2) sc = run(0.78);   // few candidates (narrow slot / many bans): accept slightly lower scores like the stored alternatives
    out[m.key] = pickPair(sc).map((x) => x.product_id);
  }
  const ctx: OutfitCtx = ctxOf(ps);
  o.acc.forEach((a, i) => {
    const cur = accs[i]; const others = accs.filter((x) => x.id !== cur.id);
    const types = new Set(others.map((x) => x.type));
    const head = others.some((x) => HEAD.has(x.type)), bag = others.some((x) => BAG.has(x.type)), neck = others.some((x) => NECK.has(x.type));
    const statement = ctx.statements > 0 || others.some((x) => x.statement >= ACC.statementMin);
    const byType = Array.from(cat.accs.filter((c) => c.genders.includes(g)));
    const pool = allowed<CatAcc>(byType, eff, COMPOSE.ban.minPoolAcc);
    const same: Cnd[] = [], other: Cnd[] = [];
    for (const c of pool) {
      if (c.id === cur.id || accs.some((x) => x.id === c.id) || reject(c, ctx) || types.has(c.type)) continue;
      if (HEAD.has(c.type) && head || BAG.has(c.type) && bag || NECK.has(c.type) && neck) continue;
      if (c.statement >= ACC.statementMin && statement) continue;
      (c.type === cur.type ? same : other).push({ product_id: c.id, brand: c.brand, score: scoreAcc(c, ctx), main: c.main, vec: c.vec });
    }
    same.sort((x, y) => y.score - x.score); other.sort((x, y) => y.score - x.score);
    out[`acc${i + 1}`] = pickPair(same.length >= 2 ? same : [...same, ...other]).map((x) => x.product_id);
  });
  return out;
}
