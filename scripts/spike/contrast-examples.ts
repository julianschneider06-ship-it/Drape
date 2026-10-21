// Style breaks: formality gap and a contact sheet of 8 old (legacy) and 8 new (polished) contrast outfits.
import { readFileSync } from "node:fs";
import { loadCat } from "./lib";
import { renderSheet, type SheetItem } from "./sheet-lib";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const items: SheetItem[] = [];
  for (const [tag, file] of [["OLD", process.env.BEFORE!], ["NEW", process.env.AFTER!]] as const) {
    const d = JSON.parse(readFileSync(file, "utf8")) as Record<string, { outfits: { ids: number[]; bucket: string; pattern?: string; score: number }[] }>;
    const all = Object.entries(d).flatMap(([k, v]) => v.outfits.filter((o) => o.bucket === "contrast").map((o) => ({ g: k.split("/")[0], ...o })));
    const gaps = all.map((o) => { const f = o.ids.map((id) => cat.byId.get(id)!.formality); return Math.max(...f) - Math.min(...f); });
    gaps.sort((a, b) => a - b);
    console.log(`${tag}: ${all.length} contrast outfits, formality gap median ${gaps[gaps.length >> 1].toFixed(2)} p10 ${gaps[Math.floor(gaps.length * 0.1)].toFixed(2)} p90 ${gaps[Math.floor(gaps.length * 0.9)].toFixed(2)}, share with gap >= 0.3: ${(100 * gaps.filter((x) => x >= 0.3).length / gaps.length).toFixed(0)}%, patterns ${JSON.stringify(all.reduce((m: Record<string, number>, o) => (m[o.pattern ?? "-"] = (m[o.pattern ?? "-"] ?? 0) + 1, m), {}))}`);
    const pick = [...all.filter((o) => o.g === "women").filter((_, i) => i % 7 === 0).slice(0, 4), ...all.filter((o) => o.g === "men").filter((_, i) => i % 7 === 0).slice(0, 4)];
    for (const o of pick) items.push({ label: `${tag} ${o.g} ${o.score.toFixed(2)}\n${(o.pattern ?? "").slice(0, 28)}`, ids: o.ids });
  }
  await renderSheet(cat, items, 8, process.env.OUT!);
})();
