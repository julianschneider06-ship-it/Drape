// Starter set builder (background job, idempotent by version): curates the fixed starter outfits per gender from the composer
// (high scores, all styles with enough supply, about 5% deliberate contrast, diverse pieces) and stores them in starter_outfits.
// Usage: npx tsx scripts/build-starter.ts [--dry] [--per 60]
import { createHash } from "node:crypto";
import { rpc } from "../src/ingest/gateway";
import { BanState } from "../src/outfits/ban";
import { compose, newSession, outfitHash, type ComposedOutfit } from "../src/outfits/compose";
import { COMPOSE } from "../src/outfits/compose-config";
import { makeRnd, order, type Cand } from "../src/outfits/pool-shared";
import { loadCat } from "./spike/lib";

const args = process.argv.slice(2); const DRY = args.includes("--dry"); const PER = Number(args[args.indexOf("--per") + 1] || COMPOSE.starter.perGender);
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const version = "s-" + createHash("sha1").update(cat.version + PER + "-v2").digest("hex").slice(0, 8);
  const rows: object[] = []; const spread: Record<string, Record<string, number>> = {};
  for (const g of ["women", "men"] as const) {
    const rnd = makeRnd(g === "women" ? 101 : 202); const pool = new Map<number, ComposedOutfit>();
    // candidate pool: many composer pages with fresh sessions (guest profile, high minimum score)
    for (let round = 0; round < 24; round++) {
      let ban = new BanState(); const ses = newSession();
      for (let page = 0; page < 14; page++) { const r = compose(cat, { gender: g, taste: null, minScore: COMPOSE.starter.minScore }, ban, 6, ses, rnd); ban = r.ban; for (const o of r.outfits) if (!pool.has(o.hash)) pool.set(o.hash, o); }
    }
    const all = [...pool.values()];
    const byStyle = new Map<string, ComposedOutfit[]>(); for (const o of all.filter((x) => x.bucket !== "contrast")) { const l = byStyle.get(o.style) ?? []; l.push(o); byStyle.set(o.style, l); }
    const styles = [...byStyle.entries()].filter(([, l]) => l.length >= 4).sort((a, b) => b[1].length - a[1].length);   // styles with enough supply
    const nContrast = Math.max(1, Math.round(PER * COMPOSE.starter.contrastShare));
    const quota = Math.max(1, Math.floor((PER - nContrast) / styles.length));
    const used = new Set<number>(); const chosen: ComposedOutfit[] = [];
    const take = (o: ComposedOutfit) => { if (o.ids.some((id) => used.has(id))) return false; o.ids.forEach((id) => used.add(id)); chosen.push(o); return true; };
    for (const [, l] of styles) { let k = 0; for (const o of l.sort((a, b) => b.score - a.score)) { if (k >= quota) break; if (take(o)) k++; } }
    for (const o of all.filter((x) => x.bucket === "contrast").sort((a, b) => b.score - a.score)) { if (chosen.filter((c) => c.bucket === "contrast").length >= nContrast) break; take(o); }
    const perStyle = new Map<string, number>(chosen.map((c) => [c.style, 0])); for (const c of chosen) perStyle.set(c.style, (perStyle.get(c.style) ?? 0) + 1);
    for (const o of all.filter((x) => x.bucket !== "contrast").sort((a, b) => b.score - a.score)) { if (chosen.length >= PER) break; if ((perStyle.get(o.style) ?? 0) >= quota + 3) continue; if (take(o)) perStyle.set(o.style, (perStyle.get(o.style) ?? 0) + 1); }   // fill with the best remaining (at most quota + 3 per style)
    // wild mix order: the pool's own ordering rules (weighted shuffle + no repeats in a row)
    const cands: Cand[] = chosen.map((o) => ({ key: String(o.hash), ids: o.ids, pieces: o.ids.map((id) => cat.byId.get(id)!), kind: o.kind, score: o.score, style: o.style }));
    const ordered = order(cands, rnd); const byKey = new Map(chosen.map((o) => [String(o.hash), o]));
    spread[g] = {}; ordered.forEach((c, i) => { const o = byKey.get(c.key)!; spread[g][o.bucket === "contrast" ? "contrast" : o.style] = (spread[g][o.bucket === "contrast" ? "contrast" : o.style] ?? 0) + 1;
      rows.push({ gender: g, ord: i, kind: o.kind, piece_ids: o.ids, acc_ids: o.acc.map((a) => a.id), score: o.score, style: o.style, contrast: o.bucket === "contrast", outfit_hash: o.hash, version }); });
    const sc = chosen.map((o) => o.score).sort((a, b) => a - b);
    console.log(`${g}: candidates ${all.length}, styles with supply ${styles.length} (quota ${quota} each), chosen ${chosen.length}, contrast ${chosen.filter((c) => c.bucket === "contrast").length}, score min/median/max ${sc[0]}/${sc[sc.length >> 1]}/${sc[sc.length - 1]}, unique tops ${new Set(chosen.map((o) => o.ids[0])).size}`);
    console.log("  style spread", JSON.stringify(Object.fromEntries(Object.entries(spread[g]).sort((a, b) => b[1] - a[1]))));
    console.log("  styles without enough supply (< 4 candidates):", [...byStyle.entries()].filter(([, l]) => l.length < 4).map(([s]) => s).join(", ") || "none");
  }
  if (!DRY) console.log("stored", await rpc("starter_put", { p_items: rows }), "rows, version", version);
  void outfitHash;
})();
