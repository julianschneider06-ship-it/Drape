// Starter set rows <-> composed outfits (the starter set is a fixed table; placement of accessories is recomputed from the catalogue, so the table only holds ids).
import { outfitCtx, placementFor } from "./accessories";
import type { Catalogue, CatPiece } from "./catalogue";
import { outfitHash, layoutCheck, type ComposedOutfit } from "./compose";
import { outfitStyle, type Piece } from "./score";
import { outfitSeason, seasonRole } from "./season";

export interface StarterRowLike { kind: "three" | "full"; piece_ids: number[]; acc_ids: number[]; score: number; style: string; contrast: boolean }
export function composedFromRow(cat: Catalogue, r: StarterRowLike): ComposedOutfit {
  const ps = r.piece_ids.map((id) => cat.byId.get(id)!);
  const ctx = outfitCtx(ps[0].genders[0], ps as Piece[], ps.map((p) => `${p.name} ${p.sub}`));
  const acc2 = r.acc_ids.flatMap((id) => { const a = cat.accById.get(id); if (!a) return []; const pl = placementFor(a, ctx); return [{ id, type: a.type, placement: pl.placement as string, zone: pl.zone, score: 0 }]; });
  const season = outfitSeason([...ps.map((p: CatPiece) => ({ mask: p.mask, role: seasonRole(p.slot, `${p.name} ${p.sub}`, p.outer, p.cold, p.warm) })), ...acc2.map((a) => ({ mask: cat.accById.get(a.id)!.mask, role: seasonRole("accessory", "", false, false, false, a.type) }))]);
  return { kind: r.kind, ids: r.piece_ids, acc: acc2, score: r.score, style: r.style || outfitStyle(ps), season, bucket: r.contrast ? "contrast" : "new", hash: outfitHash([...ps.map((p) => ({ slot: p.slot, id: p.id })), ...acc2.map((a) => ({ slot: `acc:${a.type}`, id: a.id }))]), layoutOk: layoutCheck(cat, r.kind, ps, acc2), attempts: 0 };
}
