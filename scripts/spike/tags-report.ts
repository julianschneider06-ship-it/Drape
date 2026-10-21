// Tag distributions on composed outfits (dump of scripts/spike/polish.ts) + 12 samples.
import { readFileSync } from "node:fs";
import { loadCat } from "./lib";
import { outfitTags, tagLine, type OutfitTags } from "../../src/outfits/tags";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const dump = JSON.parse(readFileSync(process.env.DUMP!, "utf8")) as Record<string, { outfits: { ids: number[]; acc: number[]; bucket: string; pattern?: string }[] }>;
  const N = Number(process.env.N ?? 600);
  for (const g of ["women", "men"] as const) {
    const all = Object.entries(dump).filter(([k]) => k.startsWith(g)).flatMap(([, v]) => v.outfits);
    // 600 outfits: every k-th of the persona outfits
    const step = Math.max(1, Math.floor(all.length / N)), pick = all.filter((_, i) => i % step === 0).slice(0, N);
    const rows = pick.map((o) => ({ o, t: outfitTags(cat, { pieces: o.ids.map((id) => cat.byId.get(id)!), accs: o.acc.map((id) => cat.accById.get(id)!).filter(Boolean), bucket: o.bucket, pattern: o.pattern }) }));
    const dist = (f: (t: OutfitTags) => string) => { const m = new Map<string, number>(); for (const r of rows) { const k = f(r.t); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / rows.length).toFixed(0)}%`).join(", "); };
    console.log(`\n===== ${g}: ${rows.length} outfits`);
    console.log("season_primary:", dist((t) => t.season_primary), "| season_fit mean", (rows.reduce((a, r) => a + r.t.season_fit, 0) / rows.length).toFixed(2), "low(<0.5)", (100 * rows.filter((r) => r.t.season_fit < 0.5).length / rows.length).toFixed(0) + "%");
    console.log("style_primary:", dist((t) => t.style_primary).slice(0, 300));
    console.log("style_distinct:", dist((t) => t.style_distinct).slice(0, 300));
    console.log("style_primary != style_distinct:", (100 * rows.filter((r) => r.t.style_primary !== r.t.style_distinct).length / rows.length).toFixed(0) + "%", "| style_strength mean", (rows.reduce((a, r) => a + r.t.style_strength, 0) / rows.length).toFixed(2), "| secondary none", (100 * rows.filter((r) => !r.t.style_secondary).length / rows.length).toFixed(0) + "%");
    console.log("formality:", dist((t) => t.formality_level), "| weather:", dist((t) => t.weather), "| rain", (100 * rows.filter((r) => r.t.rain).length / rows.length).toFixed(0) + "%");
    console.log("occasion:", dist((t) => t.occasion));
    console.log("palette kind:", dist((t) => t.palette.kind), "| accent none", (100 * rows.filter((r) => !r.t.palette.accent).length / rows.length).toFixed(0) + "% | dominant:", dist((t) => t.palette.dominant).slice(0, 160));
    console.log("boldness:", dist((t) => t.boldness), "| silhouette:", dist((t) => t.silhouette), "| contrast", (100 * rows.filter((r) => r.t.contrast).length / rows.length).toFixed(1) + "%", "| outer layer", (100 * rows.filter((r) => r.t.has_outer_layer).length / rows.length).toFixed(0) + "%", "| sale_count>0", (100 * rows.filter((r) => r.t.sale_count > 0).length / rows.length).toFixed(0) + "%");
    console.log("season x weather:", dist((t) => `${t.season_primary}/${t.weather}`).slice(0, 260));
    console.log(`-- 6 samples ${g}`);
    for (let i = 0; i < 6; i++) { const r = rows[Math.floor((i + 0.5) * rows.length / 6)]; console.log(`  ${r.o.ids.map((id) => { const p = cat.byId.get(id)!; return `${p.slot}:${p.name.slice(0, 26)} [${p.main}]`; }).join(" + ")} + acc ${r.o.acc.map((id) => cat.accById.get(id)?.type).join(",")}\n    ${tagLine(r.t)}`); }
  }
})();
