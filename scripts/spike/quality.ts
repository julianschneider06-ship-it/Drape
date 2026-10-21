// Quality simulation: 5 personas + a guest per gender. Each persona first scrolls 10 guest pages with simulated reactions (taste learned incrementally from
// the events), then 100 composed pages (600 outfits) are measured. Compared with the old pool (dump of the pool builder).
import { readFileSync, writeFileSync } from "node:fs";
import { loadCat, PERSONAS, affinity, simulateTaste, newTaste } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { STYLE_KEYS } from "../../src/classify/styles";

const POOL = process.env.POOL_DUMP ? JSON.parse(readFileSync(process.env.POOL_DUMP, "utf8")) as Record<string, { ids: number[]; score: number; style: string }[]> : null;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const out: Record<string, unknown> = {};
  for (const g of ["women", "men"] as const) {
    if (POOL) { const pl = POOL[g]; const tops = new Set(pl.map((o) => o.ids[0])), sc = pl.map((o) => o.score); console.log(`== ${g}: OLD POOL ${pl.length} outfits, unique tops ${tops.size}, bottoms ${new Set(pl.filter((o) => o.ids.length === 3).map((o) => o.ids[1])).size}, shoes ${new Set(pl.map((o) => o.ids[o.ids.length - 1])).size}, score p10/median/p90 ${q(sc, .1).toFixed(3)}/${q(sc, .5).toFixed(3)}/${q(sc, .9).toFixed(3)}`); }
    const personas = [...PERSONAS(g), null];
    for (const persona of personas) {
      const rnd = makeRnd(77), name = persona?.name ?? "guest"; let ban = new BanState(); const ses = newSession(); const taste = newTaste();
      // learning phase: 10 guest pages with simulated reactions
      if (persona) for (let p = 0; p < 10; p++) { const r = compose(cat, { gender: g, taste: null }, ban, 6, ses, rnd); ban = r.ban; simulateTaste(taste, persona, r.outfits.map((o) => ({ ps: o.ids.map((id) => cat.byId.get(id)!) })), rnd); }
      const all: { o: ReturnType<typeof compose>["outfits"][number]; aff: number }[] = []; const rejects: Record<string, number> = {}; let attempts = 0, ms = 0;
      for (let page = 0; page < 100; page++) {
        const r = compose(cat, { gender: g, taste: persona ? taste : null }, ban, 6, ses, rnd); ban = r.ban; attempts += r.stats.attempts; ms += r.stats.ms; for (const [k, v] of Object.entries(r.stats.rejects)) rejects[k] = (rejects[k] ?? 0) + v;
        for (const o of r.outfits) { const ps = o.ids.map((id) => cat.byId.get(id)!); all.push({ o, aff: persona ? ps.reduce((s, p) => s + affinity(persona, p), 0) / ps.length : 0 });
          if (persona && page < 100) simulateTaste(taste, persona, [{ ps }], rnd); }     // the device keeps reacting while it scrolls: the profile keeps learning
      }
      const sc = all.map((x) => x.o.score), tops = new Set(all.map((x) => x.o.ids[0])), bots = new Set(all.filter((x) => x.o.kind === "three").map((x) => x.o.ids[1])), shoes = new Set(all.map((x) => x.o.ids[x.o.ids.length - 1]));
      const seen = new Map<number, number>(); let repeats = 0; all.forEach((x, i) => { for (const id of x.o.ids) { const j = seen.get(id); if (j !== undefined && i - j < 300) repeats++; seen.set(id, i); } });
      const on = persona ? all.filter((x) => x.aff >= 0.5).length : 0, near = persona ? all.filter((x) => x.aff >= 0.25 && x.aff < 0.5).length : 0, far = persona ? all.filter((x) => x.aff < 0.25 && x.o.bucket !== "contrast").length : 0;
      const contrast = all.filter((x) => x.o.bucket === "contrast").length;
      const first = all.slice(0, 120).reduce((s, x) => s + x.aff, 0) / 120, last = all.slice(-120).reduce((s, x) => s + x.aff, 0) / 120;
      const styleCount = new Map<string, number>(); all.forEach((x) => styleCount.set(x.o.style, (styleCount.get(x.o.style) ?? 0) + 1));
      let poolAff = "";
      if (persona && POOL) { const pl = POOL[g]; const a = pl.map((o) => o.ids.map((id) => cat.byId.get(id)).filter(Boolean).reduce((s, p) => s + affinity(persona, p!), 0) / o.ids.length); poolAff = ` | OLD POOL for this persona: on-style ${((100 * a.filter((v) => v >= 0.5).length) / a.length).toFixed(0)}%, mean affinity ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)}`; }
      const seasonCount: Record<string, number> = {}; all.forEach((x) => { seasonCount[x.o.season.season] = (seasonCount[x.o.season.season] ?? 0) + 1; });
      console.log(`${g} / ${name}: ${all.length} outfits, score>=0.84 ${((100 * sc.filter((v) => v >= 0.84).length) / sc.length).toFixed(1)}% (non-contrast ${((100 * all.filter((x) => x.o.bucket !== "contrast" && x.o.score >= 0.84).length) / Math.max(1, all.filter((x) => x.o.bucket !== "contrast").length)).toFixed(1)}%), score p10/median/p90 ${q(sc, .1).toFixed(3)}/${q(sc, .5).toFixed(3)}/${q(sc, .9).toFixed(3)}, unique tops ${tops.size} bottoms ${bots.size} shoes ${shoes.size}, product repeats within 300 outfits ${repeats}`);
      console.log(`    taste: on-style ${persona ? ((100 * on) / all.length).toFixed(0) : "-"}% near ${persona ? ((100 * near) / all.length).toFixed(0) : "-"}% new ${persona ? ((100 * far) / all.length).toFixed(0) : "-"}% contrast ${((100 * contrast) / all.length).toFixed(1)}% | mean affinity first 120 -> last 120: ${first.toFixed(2)} -> ${last.toFixed(2)}${poolAff}`);
      console.log(`    validators: attempts per outfit ${(attempts / all.length).toFixed(2)}, rejects ${JSON.stringify(rejects)}, attempt failure rate ${((100 * Object.entries(rejects).filter(([k]) => !k.startsWith("candidate:")).reduce((a, [, b]) => a + b, 0)) / attempts).toFixed(1)}% of attempts (candidate-level filters like length-shoes not counted); ms/page ${(ms / 100).toFixed(0)}; styles ${styleCount.size} (top: ${[...styleCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${s} ${n}`).join(", ")}); seasons ${JSON.stringify(seasonCount)}`);
      out[`${g}/${name}`] = { n: all.length };
    }
  }
  writeFileSync(process.env.QUALITY_OUT ?? "/dev/null", JSON.stringify(out)); void STYLE_KEYS;
})();
