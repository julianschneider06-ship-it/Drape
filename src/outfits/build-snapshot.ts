// Catalogue snapshot job (background, idempotent): merges classification (outfit_inputs / acc_inputs) with composer extras (composer_inputs),
// packs everything into one gzip+base64 blob and stores it in catalogue_snapshot when the content changed (version = hash of the content).
// Used by scripts/build-catalogue.ts (manual) and the job runner (after a stock refresh that changed something).
import { createHash } from "node:crypto";
import { rpc } from "../ingest/gateway";
import { packSnapshot, type RawCatAcc, type RawCatPiece, type Snapshot } from "./catalogue";

async function all<T>(fn: string, lim = 1000): Promise<T[]> {
  const out: T[] = []; let after = 0;
  for (;;) { const p = await rpc<(T & { id: number })[]>(fn, { p_after: after, p_limit: lim }); if (!p.length) break; out.push(...p); after = p[p.length - 1].id; }
  return out;
}
const r3 = (o: Record<string, number> | null) => (o ? Object.fromEntries(Object.entries(o).filter(([, v]) => v >= 0.02).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) : o);

export async function buildSnapshot(o: { dry?: boolean }): Promise<{ version: string; pieces: number; accs: number; packedKB: number; ms: number; stored: number | null }> {
  const t0 = Date.now();
  const [cls, extra, accCls] = [await all<RawCatPiece>("outfit_inputs"), await all<Record<string, unknown> & { id: number }>("composer_inputs"), await all<RawCatAcc>("acc_inputs")];
  const ex = new Map(extra.map((e) => [e.id, e]));
  const pieces = cls.flatMap((c) => { const e = ex.get(c.id); if (!e || e.slot === "accessory") return []; return [{ ...c, styles: r3(c.styles) as Record<string, number>, brand: e.brand as string, aspect: e.aspect as number, hem: e.hem as number | null, waist: e.waist as number | null, collar: e.collar as number | null, hood: e.hood as boolean | null, fill: e.fill as number | null, presentation: e.presentation as string | null, cutout: e.cutout as string, image: e.image as string, url: e.url as string, price_cents: e.price_cents as number | null, compare_at_cents: e.compare_at_cents as number | null, currency: e.currency as string | null }]; });
  const accs = accCls.flatMap((c) => { const e = ex.get(c.id); return e && e.slot === "accessory" ? [{ ...c, styles: r3(c.styles) as Record<string, number>, brand: e.brand as string, aspect: e.aspect as number, cutout: e.cutout as string, image: e.image as string, url: e.url as string, price_cents: e.price_cents as number | null, compare_at_cents: e.compare_at_cents as number | null, currency: e.currency as string | null }] : []; });
  const body = { pieces, accs };
  const version = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  const snap: Snapshot = { version, ...body };
  const packed = packSnapshot(snap);
  const stored = o.dry ? null : await rpc<number>("snapshot_put", { p_version: version, p_n: pieces.length + accs.length, p_data: packed });
  return { version, pieces: pieces.length, accs: accs.length, packedKB: (packed.length / 1024) | 0, ms: Date.now() - t0, stored };
}
