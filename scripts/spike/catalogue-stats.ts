// Catalogue size per gender (main pieces per slot, accessories) and supply per dominant style / slot / gender.
import { loadCat } from "./lib";
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  const slots = ["top", "bottom", "shoes", "full_body"] as const;
  for (const g of ["women", "men"] as const) {
    const ps = cat.pieces.filter((p) => p.genders.includes(g)), only = ps.filter((p) => p.genders.length === 1).length;
    console.log(`${g}: main ${ps.length} (only ${g} ${only}, unisex ${ps.length - only}); by slot ${slots.map((s) => `${s} ${ps.filter((p) => p.slot === s).length}`).join(", ")}; accessories ${cat.accs.filter((a) => a.genders.includes(g)).length}`);
    const m = new Map<string, number[]>();
    for (const p of ps) { const k = p.dom; const a = m.get(k) ?? [0, 0, 0]; a[p.slot === "top" || p.slot === "full_body" ? 0 : p.slot === "bottom" ? 1 : 2]++; m.set(k, a); }
    const thin = ["techwear", "grunge", "punk_edgy", "y2k", "coquette", "boho", "dark_academia", "quiet_luxury", "old_money", "preppy", "western", "skater", "scandi", "vintage", "retro_sport", "business_casual"];
    console.log("  tops/bottoms/shoes: " + thin.map((k) => `${k} ${(m.get(k) ?? [0, 0, 0]).join("/")}`).join(", "));
  }
  console.log(`total main ${cat.pieces.length}, accessories ${cat.accs.length}, version ${cat.version}`);
})();
