// Season samples (6 + 6 composed outfits with the pieces' season lists and the derived season) and style supply per gender / slot.
import { loadCat } from "./lib";
import { compose, newSession } from "../../src/outfits/compose";
import { BanState } from "../../src/outfits/ban";
import { makeRnd } from "../../src/outfits/pool-shared";
import { STYLE_KEYS } from "../../src/classify/styles";

const bits = (m: number) => (!m || m === 15 ? "all" : ["spring", "summer", "autumn", "winter"].filter((_, i) => m & (1 << i)).join("+"));
(async () => {
  const { cat } = await loadCat(process.env.SNAP_CACHE);
  for (const g of ["women", "men"] as const) {
    const r = compose(cat, { gender: g, taste: null }, new BanState(), 6, newSession(), makeRnd(g === "women" ? 31 : 32));
    console.log(`--- ${g}`);
    for (const o of r.outfits) {
      const parts = [...o.ids.map((id) => { const p = cat.byId.get(id)!; return `${p.slot}:${p.name.slice(0, 34)} [${bits(p.mask)}]`; }), ...o.acc.map((a) => { const c = cat.accById.get(a.id)!; return `${a.type}:${c.name.slice(0, 26)} [${bits(c.mask)}]`; })];
      console.log(`  => ${o.season.season.toUpperCase()} fit ${o.season.fit} (common ${bits(o.season.mask)}) | ${parts.join(" | ")}`);
    }
  }
  // supply: pieces per dominant style and slot (piece "belongs" to the style with the largest weight)
  for (const g of ["women", "men"] as const) {
    const t: Record<string, Record<string, number>> = {};
    for (const p of cat.pieces) if (p.genders.includes(g)) { (t[p.dom] ??= { top: 0, bottom: 0, shoes: 0, full_body: 0 })[p.slot]++; }
    const low = STYLE_KEYS.filter((s) => { const x = t[s] ?? { top: 0, bottom: 0, shoes: 0 }; return Math.min(x.top, x.bottom, x.shoes) < 15; });
    console.log(`SUPPLY ${g}: ` + STYLE_KEYS.map((s) => { const x = t[s] ?? { top: 0, bottom: 0, shoes: 0, full_body: 0 }; return `${s} ${x.top}/${x.bottom}/${x.shoes}`; }).join(", "));
    console.log(`  thin (fewer than 15 tops, bottoms or shoes with this dominant style): ${low.join(", ")}`);
  }
})();
