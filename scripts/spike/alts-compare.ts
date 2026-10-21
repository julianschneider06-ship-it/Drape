// Swap alternatives: composer vs the stored ones (same outfit, rest fixed): outfit score of the replaced outfit, share >= 0.84, visibly-different pair.
import { loadCat } from "./lib";
import { rpc } from "../../src/ingest/gateway";
import { scoreOutfit } from "../../src/outfits/score";
import { alternativesFor } from "../../src/outfits/compose-alts";
import { BanState } from "../../src/outfits/ban";
import { outfitStyle } from "../../src/outfits/score";
import type { ComposedOutfit } from "../../src/outfits/compose";

const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const rows = await rpc<{ gender: "women" | "men"; kind: string; top: number; bottom: number; shoes: number; alts: Record<string, number[]> | null }[]>("outfit_alt_pairs", { p_n: 400 });
  const res: Record<string, { stored: number[]; comp: number[]; storedPair: number[]; compPair: number[]; n: [number, number] }> = {};
  for (const r of rows) {
    const full = r.kind === "full"; const ids = full ? [r.top, r.shoes] : [r.top, r.bottom, r.shoes]; const ps = ids.map((i) => cat.byId.get(i)); if (ps.some((p) => !p) || !r.alts) continue;
    const o: ComposedOutfit = { kind: full ? "full" : "three", ids, acc: [], score: 0, style: outfitStyle(ps as never), season: { season: "all", fit: 1, mask: 15, votes: {} }, bucket: "new", hash: 0, layoutOk: true, attempts: 0 };
    const eff = new BanState().effective(cat, r.gender);
    const comp = alternativesFor(cat, r.gender, o, eff);
    for (const [key, idx] of [["top", 0], ["bottom", 1], ["shoes", ids.length - 1]] as const) {
      if (key === "bottom" && full) continue;
      const sc = (altId: number) => { const p = cat.byId.get(altId); if (!p) return null; const next = ps.map((x, i) => (i === idx ? p : x)) as never[]; return scoreOutfit(next)?.score ?? 0; };
      const e = (res[key] ??= { stored: [], comp: [], storedPair: [], compPair: [], n: [0, 0] });
      for (const id of r.alts[key] ?? []) { const s = sc(id); if (s !== null) e.stored.push(s); }
      for (const id of comp[key] ?? []) { const s = sc(id); if (s !== null) e.comp.push(s); }
      const pair = (list: number[]) => { const [a, b] = list.map((i) => cat.byId.get(i)); return a && b ? (a.main !== b.main ? 1 : 0) + (a.brand !== b.brand ? 1 : 0) : -1; };
      const sp = pair(r.alts[key] ?? []), cp = pair(comp[key] ?? []); if (sp >= 0) e.storedPair.push(sp); if (cp >= 0) e.compPair.push(cp);
      e.n[0] += (r.alts[key] ?? []).length; e.n[1] += (comp[key] ?? []).length;
    }
  }
  for (const [k, e] of Object.entries(res)) {
    const f = (a: number[]) => `n ${a.length}, score median ${q(a, .5).toFixed(3)}, p10 ${q(a, .1).toFixed(3)}, share >= 0.84 ${((100 * a.filter((v) => v >= 0.84).length) / a.length).toFixed(0)}%`;
    const m = (a: number[]) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
    console.log(`${k}: STORED ${f(e.stored)}; pair different in colour+brand (0-2): ${m(e.storedPair)} | COMPOSER ${f(e.comp)}; pair different: ${m(e.compPair)}; alternatives found ${e.n[1]} vs ${e.n[0]}`);
  }
})();
