// Contact sheets of outfits (default pool + dynamic composer) that contain pieces of the new shops, plus piece sheets per shop to spot bad cutouts / model photos.
import { readFileSync, writeFileSync } from "node:fs";
import { loadCat } from "./lib";
import { renderSheet, type SheetItem } from "./sheet-lib";
const GROUPS: Record<string, string[]> = { techwear: ["satisfyrunning", "whitemountaineering"], skater: ["polarskate"], "old money shoes": ["crockettandjones", "trickers", "aldenshop", "greats"], "preppy shoes": ["sebago", "ghbass", "beckettsimonon", "meermin"], western: ["tecovas", "lucchese"], sporty: ["hummel", "ellesse", "hellstar", "pleasuresnow"] };
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE); const OUT = process.env.OUT!;
  const stores = new Map<string, number>(); for (const p of cat.pieces) stores.set(p.store, (stores.get(p.store) ?? 0) + 1);
  const all = Object.values(GROUPS).flat(); console.log("stores in catalogue:", all.map((s) => `${s}:${stores.get(s) ?? 0}`).join(" "));
  const pool = JSON.parse(readFileSync(process.env.POOL!, "utf8")) as Record<string, { ids: number[] }[]>;
  const dyn = JSON.parse(readFileSync(process.env.DYN!, "utf8")) as Record<string, { outfits: { ids: number[] }[] }>;
  const dynAll: { g: string; ids: number[] }[] = Object.entries(dyn).flatMap(([k, v]) => v.outfits.map((o) => ({ g: k.split("/")[0], ids: o.ids })));
  const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
  for (const [kind, list] of [["pool", Object.entries(pool).flatMap(([g, v]) => v.map((o) => ({ g, ids: o.ids })))], ["dynamic", dynAll]] as const) {
    const items: SheetItem[] = []; const used = new Set<string>();
    for (const [grp, slugs] of Object.entries(GROUPS)) for (const g of ["women", "men"]) {
      const c = list.filter((o) => o.g === g && o.ids.some((id) => slugs.includes(cat.byId.get(id)?.store ?? "")));
      for (let tries = 0; tries < 50 && c.length; tries++) { const o = c[Math.floor(rnd() * c.length)]; const k = o.ids.join(); if (used.has(k)) continue; used.add(k); items.push({ label: `${grp} ${g}\n${o.ids.map((id) => cat.byId.get(id)?.store ?? "?").join(" ").slice(0, 40)}`, ids: o.ids }); break; }
    }
    console.log(kind, "outfits in sheet:", items.length);
    await renderSheet(cat, items, 6, `${OUT}/outfits_${kind}.png`);
    writeFileSync(`${OUT}/outfits_${kind}.json`, JSON.stringify(items));
  }
  // piece sheets: 10 random main pieces per new shop
  const shops = [...new Set(all)], per: SheetItem[] = [];
  for (const s of shops) { const ps = cat.pieces.filter((p) => p.store === s); for (let i = 0; i < Math.min(12, ps.length); i++) { const p = ps.splice(Math.floor(rnd() * ps.length), 1)[0]; per.push({ label: `${s}\n${p.id} ${p.name.slice(0, 22)}`, ids: [p.id] }); } }
  for (let i = 0; i < per.length; i += 36) await renderSheet(cat, per.slice(i, i + 36).map((x) => ({ ...x })), 9, `${OUT}/pieces_${i / 36}.png`, { w: 130, h: 130, label: 40 });
  console.log("piece sheets:", Math.ceil(per.length / 36));
})();
