// Tone-on-tone: 8 before/after examples (legacy composer outfits with the same saturated hue on top and bottom; "after" = best replacement bottom
// under the new rule for the same top + shoes), plus the count in the old pool. Usage: SNAP_CACHE=.. BEFORE=polish_before.json POOL=pool.json OUT=sheet.png
import { readFileSync } from "node:fs";
import { loadCat } from "./lib";
import { scoreOutfit } from "../../src/outfits/score";
import { toneOnTone, tonePenalty } from "../../src/outfits/compose-polish";
import { renderSheet, type SheetItem } from "./sheet-lib";
import type { CatPiece } from "../../src/outfits/catalogue";

(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const before = JSON.parse(readFileSync(process.env.BEFORE!, "utf8")) as Record<string, { tone: number[][] }>;
  const seen = new Set<string>(), ex: { g: string; ids: number[] }[] = [];
  for (const [k, v] of Object.entries(before)) for (const ids of v.tone) { const key = ids.join(); if (ex.length < 8 && !seen.has(key) && ex.filter((e) => e.g === k.split("/")[0]).length < 4) { seen.add(key); ex.push({ g: k.split("/")[0], ids }); } }
  const items: SheetItem[] = [];
  for (const e of ex) {
    const ps = e.ids.map((id) => cat.byId.get(id)!), [t, b, s] = ps;
    const raw = scoreOutfit(ps)!.score, pen = raw * tonePenalty(ps);
    let best: { p: CatPiece; v: number } | null = null;
    for (const c of cat.pieces) if (c.slot === "bottom" && c.genders.includes(e.g as "women" | "men") && c.id !== b.id) { const r = scoreOutfit([t, c, s]); if (!r) continue; const v = r.score * tonePenalty([t, c, s]); if (v >= 0.84 && !toneOnTone(t, c) && (!best || v > best.v)) best = { p: c, v }; }
    console.log(`${e.g}: ${t.name} [${t.main}] + ${b.name} [${b.main}] + ${s.name} | score ${raw.toFixed(3)} -> ${pen.toFixed(3)} ${pen < 0.84 ? "(dropped: below 0.84)" : "(kept, penalised)"} | after: ${best ? `${best.p.name} [${best.p.main}] ${best.v.toFixed(3)}` : "none"}`);
    items.push({ label: `BEFORE ${e.g}\n${t.main}+${b.main} ${raw.toFixed(2)}`, ids: e.ids });
    if (best) items.push({ label: `AFTER\n${t.main}+${best.p.main} ${best.v.toFixed(2)}`, ids: [t.id, best.p.id, s.id] });
  }
  await renderSheet(cat, items, 4, process.env.OUT!);
  const pool = JSON.parse(readFileSync(process.env.POOL!, "utf8")) as Record<string, { ids: number[] }[]>;
  for (const g of ["women", "men"]) { const o = pool[g]; let n = 0, three = 0; for (const x of o) { if (x.ids.length !== 3) continue; three++; const [t, b] = x.ids.map((id) => cat.byId.get(id)); if (t && b && toneOnTone(t, b)) n++; } console.log(`OLD POOL ${g}: ${n} of ${three} three-piece outfits (${(100 * n / three).toFixed(1)}%) have top + bottom in the same saturated hue (pool of ${o.length} outfits)`); }
})();
