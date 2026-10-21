// Polish measurement: per gender and persona 10 learning pages + 100 composed pages (600 outfits), legacy rules (LEGACY=1) or the polished composer.
// Prints: attempt failure rate and its reasons, score distribution, contrast share, tone-on-tone count, subcategory distribution, run lengths.
import { writeFileSync } from "node:fs";
import { loadCat, PERSONAS, simulateTaste, newTaste } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { scoreOutfit } from "../../src/outfits/score";
import { subGroup, toneOnTone } from "../../src/outfits/compose-polish";

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
const legacy = process.env.LEGACY === "1", ONLY = process.env.GENDER;
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const dump: Record<string, unknown> = {};
  for (const g of ["women", "men"] as const) {
    if (ONLY && ONLY !== g) continue;
    const agg = { rej: {} as Record<string, number>, attempts: 0, n: 0 };
    for (const persona of [...PERSONAS(g), null]) {
      const rnd = makeRnd(77), name = persona?.name ?? "guest"; let ban = new BanState(); const ses = newSession(); const taste = newTaste();
      if (persona) for (let p = 0; p < 10; p++) { const r = compose(cat, { gender: g, taste: null, legacy }, ban, 6, ses, rnd); ban = r.ban; simulateTaste(taste, persona, r.outfits.map((o) => ({ ps: o.ids.map((id) => cat.byId.get(id)!) })), rnd); }
      const all: ReturnType<typeof compose>["outfits"] = []; const rejects: Record<string, number> = {}; let attempts = 0;
      for (let page = 0; page < 100; page++) {
        const r = compose(cat, { gender: g, taste: persona ? taste : null, legacy }, ban, 6, ses, rnd); ban = r.ban; attempts += r.stats.attempts;
        for (const [k, v] of Object.entries(r.stats.rejects)) rejects[k] = (rejects[k] ?? 0) + v;
        all.push(...r.outfits); if (persona) simulateTaste(taste, persona, r.outfits.map((o) => ({ ps: o.ids.map((id) => cat.byId.get(id)!) })), rnd);
      }
      const fails = Object.entries(rejects).filter(([k]) => !k.startsWith("candidate:") && !k.startsWith("soft:")).reduce((a, [, b]) => a + b, 0);
      const sc = all.map((o) => o.score), raw = all.map((o) => scoreOutfit(o.ids.map((id) => cat.byId.get(id)!))?.score ?? 0);
      const normal = all.filter((o) => o.bucket !== "contrast").map((o) => o.score);
      const contrast = all.filter((o) => o.bucket === "contrast");
      const tone = all.filter((o) => { const ps = o.ids.map((id) => cat.byId.get(id)!); const t = ps.find((p) => p.slot === "top"), b = ps.find((p) => p.slot === "bottom"); return !!t && !!b && toneOnTone(t, b); });
      const cnt = (slot: "top" | "bottom") => { const m = new Map<string, number>(); for (const o of all) for (const id of o.ids) { const p = cat.byId.get(id)!; if (p.slot === slot) m.set(subGroup(p), (m.get(subGroup(p)) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
      const winMax = (slot: "top" | "bottom") => { let mx = 0; for (let i = 0; i + 10 <= all.length; i++) { const m = new Map<string, number>(); for (const o of all.slice(i, i + 10)) for (const id of o.ids) { const p = cat.byId.get(id)!; if (p.slot === slot) m.set(subGroup(p), (m.get(subGroup(p)) ?? 0) + 1); } mx = Math.max(mx, ...m.values()); } return mx; };
      const runLen = (f: (o: (typeof all)[number]) => string) => { let mx = 0, c = 0, last = ""; for (const o of all) { const v = f(o); c = v === last ? c + 1 : 1; last = v; mx = Math.max(mx, c); } return mx; };
      const styleCount = new Set(all.map((o) => o.style)).size;
      const gp = (k: string) => Object.entries(rejects).filter(([r]) => r.startsWith(k)).reduce((a, [, b]) => a + b, 0);
      console.log(`${g} / ${name}: ${all.length} outfits | attempt failure ${(100 * fails / attempts).toFixed(1)}% (${fails}/${attempts}) | no-candidate anchor ${rejects["no-candidate:anchor"] ?? 0} partner ${rejects["no-candidate:partner"] ?? 0} min-score ${rejects["no-candidate:min-score"] ?? 0} (old key no-candidate ${rejects["no-candidate"] ?? 0}) | streak product ${rejects["streak:product"] ?? 0} style ${rejects["streak:style"] ?? 0} store ${rejects["streak:store"] ?? 0} (old key streak ${rejects["streak"] ?? 0}) | layout ${gp("layout")} | soft re-draws (streak) ${rejects["soft:streak"] ?? 0}`);
      console.log(`    score p10/median/p90 ${q(sc, 0.1).toFixed(3)}/${q(sc, 0.5).toFixed(3)}/${q(sc, 0.9).toFixed(3)} (normal only ${q(normal, 0.1).toFixed(3)}/${q(normal, 0.5).toFixed(3)}) raw scoreOutfit median ${q(raw, 0.5).toFixed(3)} | contrast ${(100 * contrast.length / all.length).toFixed(1)}% | tone-on-tone ${tone.length} (${(100 * tone.length / all.length).toFixed(1)}%) | styles ${styleCount} | longest run style ${runLen((o) => o.style)} store ${runLen((o) => cat.byId.get(o.ids[0])!.store)} | max same top group in 10: ${winMax("top")} bottom: ${winMax("bottom")}`);
      console.log(`    tops ${cnt("top").slice(0, 6).map((x) => x.join(" ")).join(", ")} | bottoms ${cnt("bottom").slice(0, 6).map((x) => x.join(" ")).join(", ")}`);
      for (const [k, v] of Object.entries(rejects)) agg.rej[k] = (agg.rej[k] ?? 0) + v; agg.attempts += attempts; agg.n += all.length;
      dump[`${g}/${name}`] = { outfits: all.map((o) => ({ ids: o.ids, acc: o.acc.map((a) => a.id), score: o.score, bucket: o.bucket, pattern: o.pattern, style: o.style })), tone: tone.map((o) => o.ids), contrast: contrast.map((o) => o.ids) };
    }
    const f = Object.entries(agg.rej).filter(([k]) => !k.startsWith("candidate:") && !k.startsWith("soft:")).reduce((a, [, b]) => a + b, 0);
    console.log(`== ${g} ALL: attempt failure ${(100 * f / agg.attempts).toFixed(1)}% reasons ${JSON.stringify(agg.rej)}`);
  }
  if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify(dump));
})();
