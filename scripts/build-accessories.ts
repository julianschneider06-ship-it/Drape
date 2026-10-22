// Accessory builder (background job, idempotent, re-runnable): chooses 0-3 accessories per pool outfit and stores them in outfit_accessories.
// No work in the request path: the feed only reads the cached rows. Usage: npx tsx scripts/build-accessories.ts [--dry] [--out file.json]
import { writeFileSync } from "node:fs";
import { rpc } from "../src/ingest/gateway";
import { toPiece, type Piece, type RawPiece } from "../src/outfits/score";
import { chooseAccessories, outfitCtx, toAcc, type Acc, type RawAcc, type Usage } from "../src/outfits/accessories";

const args = process.argv.slice(2);
let twoAccent = 0;
const DRY = args.includes("--dry");
const W2 = args.includes("--w2");   // women only, writes outfit_accessories_w2 (new revision, insert-only; the old set is untouched)
const outIdx = args.indexOf("--out");

interface PoolRow { id: number; gender: "women" | "men"; kind: string; top: number; bottom: number; shoes: number; order: number }

async function paged<T>(fn: string, limit: number, extra: Record<string, unknown> = {}): Promise<T[]> {
  const out: T[] = []; let after = 0;
  for (;;) {
    const page = await rpc<{ id: number }[]>(fn, { p_after: after, p_limit: limit, ...extra });
    if (!page.length) break;
    out.push(...(page as unknown as T[])); after = page[page.length - 1].id;
  }
  return out;
}

(async () => {
  const pool = await paged<PoolRow>("outfit_pool_list", 2000);
  const raw = await paged<RawPiece>("outfit_inputs", 1000);
  const pieces = new Map<number, Piece>(); const names = new Map<number, string>();
  for (const r of raw) { const p = toPiece(r); if (p) { pieces.set(r.id, p); names.set(r.id, `${r.name ?? ""} ${r.sub ?? ""}`); } }
  const accs = (await paged<RawAcc>("acc_inputs", 1000)).map(toAcc);
  console.log(`outfits ${pool.length}, main pieces ${pieces.size}, accessories ${accs.length}`);

  const run = DRY ? 0 : await rpc<number>(W2 ? "outfit_acc_w2_run_next" : "outfit_acc_run_next");
  const rows: object[] = []; const stats: Record<string, Record<string, number>> = { women: {}, men: {} };
  const placements: Record<string, number> = {}; const byType: Record<string, number> = {};
  for (const gender of (W2 ? ["women"] : ["women", "men"]) as ("women" | "men")[]) {
    const usage: Usage = { uses: new Map(), recentIds: [], recentStores: [] };
    const cands = accs.filter((a) => a.genders.includes(gender));
    for (const o of pool.filter((x) => x.gender === gender).sort((a, b) => a.order - b.order)) {
      const ps = [o.top, ...(o.bottom ? [o.bottom] : []), o.shoes].map((id) => pieces.get(id));
      if (ps.some((p) => !p)) { stats[gender]["?"] = (stats[gender]["?"] ?? 0) + 1; continue; }
      const ctx = outfitCtx(gender, ps as Piece[], [o.top, o.bottom, o.shoes].map((id) => names.get(id) ?? ""));
      const picks = chooseAccessories(ctx, cands, usage);
      if (picks.filter((p) => p.acc.accent).length >= 2) twoAccent++;
      stats[gender][String(picks.length)] = (stats[gender][String(picks.length)] ?? 0) + 1;
      picks.forEach((p, i) => {
        rows.push({ outfit_id: o.id, slot_no: i + 1, product_id: p.acc.id, accessory_type: p.acc.type, placement: p.placement, zone: p.zone, score: +p.score.toFixed(3) });
        usage.uses.set(p.acc.id, (usage.uses.get(p.acc.id) ?? 0) + 1);
        placements[`${p.placement}/${p.zone}`] = (placements[`${p.placement}/${p.zone}`] ?? 0) + 1; byType[p.acc.type] = (byType[p.acc.type] ?? 0) + 1;
      });
      usage.recentIds.push(picks.map((p) => p.acc.id)); usage.recentStores.push(picks.map((p) => p.acc.store));
      if (usage.recentIds.length > 14) { usage.recentIds.shift(); usage.recentStores.shift(); }
    }
  }
  console.log("accessories per outfit", JSON.stringify(stats)); console.log("placements", JSON.stringify(placements)); console.log("by type", JSON.stringify(byType)); console.log("outfits with two strong accent colours in the accessories", twoAccent);
  if (outIdx >= 0) writeFileSync(args[outIdx + 1], JSON.stringify(rows));
  if (!DRY) {
    for (let i = 0; i < rows.length; i += 500) await rpc(W2 ? "outfit_acc_w2_upsert" : "outfit_acc_upsert", { p_run: run, p_items: rows.slice(i, i + 500) });
    if (W2) console.log(`run ${run}: ${rows.length} rows stored (insert-only; readers use the latest run)`);
    else { const removed = await rpc<number>("outfit_acc_finish", { p_run: run }); console.log(`run ${run}: ${rows.length} rows stored, ${removed} older rows removed`); }
  }
})();
