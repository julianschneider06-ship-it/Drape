// Compose benchmark in Node: latency for 6 outfits (with / without the 2 alternatives per piece), memory, cold start pieces.
import { loadCat, PERSONAS, simulateTaste, newTaste } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { alternativesFor } from "../../src/outfits/compose-alts";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { tasteBytes } from "../../src/outfits/taste";

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
(async () => {
  const t0 = performance.now(); const { cat, loadMs, blobKB } = await loadCat(process.env.SNAP_CACHE);
  console.log(`catalogue: ${cat.pieces.length} pieces + ${cat.accs.length} accessories, blob ${blobKB.toFixed(0)} KB, load incl. unpack/build ${loadMs.toFixed(0)} ms (file cache), heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`);
  for (const g of ["women", "men"] as const) for (const kind of ["guest", "taste"] as const) {
    const rnd = makeRnd(3), ses = newSession(); let ban = new BanState(); const taste = newTaste();
    if (kind === "taste") for (let p = 0; p < 8; p++) { const r = compose(cat, { gender: g, taste: null }, ban, 6, ses, rnd); ban = r.ban; simulateTaste(taste, PERSONAS(g)[2], r.outfits.map((o) => ({ ps: o.ids.map((id) => cat.byId.get(id)!) })), rnd); }
    const a: number[] = [], b: number[] = [];
    for (let page = 0; page < 150; page++) {
      const r = compose(cat, { gender: g, taste: kind === "taste" ? taste : null }, ban, 6, ses, rnd); ban = r.ban; a.push(r.stats.ms);
      const eff = ban.effective(cat, g); const t = performance.now(); for (const o of r.outfits) alternativesFor(cat, g, o, eff); b.push(performance.now() - t);
    }
    console.log(`${g}/${kind}: compose 6 outfits p50 ${q(a, .5).toFixed(1)} ms p95 ${q(a, .95).toFixed(1)} ms | alternatives for the 6 outfits p50 ${q(b, .5).toFixed(1)} ms p95 ${q(b, .95).toFixed(1)} ms | ban list ${(ban.ids.length * 4 / 1024).toFixed(1)} KB, taste ${(tasteBytes(taste) / 1024).toFixed(1)} KB`);
  }
  void t0;
})();
