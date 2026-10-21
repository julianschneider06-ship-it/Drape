// Catalogue snapshot job (background, idempotent): merges classification (outfit_inputs / acc_inputs) with composer extras (composer_inputs),
// packs everything into one gzip+base64 blob and stores it in catalogue_snapshot when the content changed (version = hash of the content).
// Usage: npx tsx scripts/build-catalogue.ts [--dry]
import { createHash } from "node:crypto";
import { rpc } from "../src/ingest/gateway";
import { buildCatalogue, packSnapshot, unpackSnapshot, type RawCatAcc, type RawCatPiece, type Snapshot } from "../src/outfits/catalogue";

const DRY = process.argv.includes("--dry");
async function all<T>(fn: string, lim = 1000): Promise<T[]> {
  const out: T[] = []; let after = 0;
  for (;;) { const p = await rpc<(T & { id: number })[]>(fn, { p_after: after, p_limit: lim }); if (!p.length) break; out.push(...p); after = p[p.length - 1].id; }
  return out;
}
const r3 = (o: Record<string, number> | null) => (o ? Object.fromEntries(Object.entries(o).filter(([, v]) => v >= 0.02).map(([k, v]) => [k, Math.round(v * 1000) / 1000])) : o);

(async () => {
  const t0 = Date.now();
  const [cls, extra, accCls] = [await all<RawCatPiece>("outfit_inputs"), await all<Record<string, unknown> & { id: number }>("composer_inputs"), await all<RawCatAcc>("acc_inputs")];
  const ex = new Map(extra.map((e) => [e.id, e]));
  const pieces = cls.flatMap((c) => { const e = ex.get(c.id); if (!e || e.slot === "accessory") return []; return [{ ...c, styles: r3(c.styles) as Record<string, number>, brand: e.brand as string, aspect: e.aspect as number, hem: e.hem as number | null, waist: e.waist as number | null, collar: e.collar as number | null, hood: e.hood as boolean | null, fill: e.fill as number | null, presentation: e.presentation as string | null }]; });
  const accs = accCls.flatMap((c) => { const e = ex.get(c.id); return e && e.slot === "accessory" ? [{ ...c, styles: r3(c.styles) as Record<string, number>, brand: e.brand as string, aspect: e.aspect as number }] : []; });
  const body = { pieces, accs };
  const version = createHash("sha1").update(JSON.stringify(body)).digest("hex").slice(0, 12);
  const snap: Snapshot = { version, ...body };
  const packed = packSnapshot(snap);
  console.log(`pieces ${pieces.length}, accessories ${accs.length}, version ${version}, json ${(JSON.stringify(snap).length / 1024) | 0} KB, packed ${(packed.length / 1024) | 0} KB (base64 gzip), fetched+merged in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // memory + build time of the in-memory catalogue
  global.gc?.(); const m0 = process.memoryUsage();
  const t1 = performance.now(); const cat = buildCatalogue(unpackSnapshot(packed)); const t2 = performance.now();
  global.gc?.(); const m1 = process.memoryUsage();
  console.log(`catalogue build from the blob: unpack+build ${(t2 - t1).toFixed(0)} ms, heap +${((m1.heapUsed - m0.heapUsed) / 1048576).toFixed(1)} MB, arrayBuffers +${((m1.arrayBuffers - m0.arrayBuffers) / 1048576).toFixed(2)} MB, pieces ${cat.pieces.length}, accessories ${cat.accs.length}`);
  if (!DRY) { const id = await rpc<number>("snapshot_put", { p_version: version, p_n: pieces.length + accs.length, p_data: packed }); console.log("stored snapshot", id); }
})();
